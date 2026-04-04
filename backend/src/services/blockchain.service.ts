// ─────────────────────────────────────────────────────────
// Blockchain Service — On-chain deposit detection & balance sync
// Uses balance-diff approach (no Alchemy dependency needed)
// ─────────────────────────────────────────────────────────

import { ethers } from 'ethers';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../config/database';
import { getProvider, getOnChainBalanceWei, getGameWalletSigner, estimateTransferGas } from '../utils/wallet';

// ─────────────────────────────────────────────────────────
// Sync deposits for a user by comparing on-chain vs DB balance
// ─────────────────────────────────────────────────────────

export async function syncDeposits(userId: string): Promise<{
  newDeposit: boolean;
  depositAmount: string;
  onChainBalance: string;
  gameBalance: string;
}> {
  // Get user with their game wallet
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { gameWallet: true, email: true, lastSyncedBlock: true },
  });

  if (!user?.gameWallet) {
    return { newDeposit: false, depositAmount: '0', onChainBalance: '0', gameBalance: '0' };
  }

  // Get current on-chain balance
  const onChainBalanceWei = await getOnChainBalanceWei(user.gameWallet);
  const onChainBalance = ethers.formatEther(onChainBalanceWei);

  // Get sum of all confirmed deposits and withdrawals in DB
  const [depositSum, withdrawalSum, stakeLockSum, stakeReturnSum] = await Promise.all([
    sumConfirmedTx(userId, 'DEPOSIT'),
    sumConfirmedTx(userId, 'WITHDRAWAL'),
    sumConfirmedTx(userId, 'STAKE_LOCK'),
    sumConfirmedTx(userId, 'STAKE_RETURN'),
  ]);

  // Expected on-chain balance = deposits - withdrawals - stakeLocks + stakeReturns
  // (payouts and board purchases are DB-only for game balance)
  const expectedOnChainWei = ethers.parseEther(
    Math.max(0, depositSum - withdrawalSum - stakeLockSum + stakeReturnSum).toFixed(18)
  );

  // If on-chain balance exceeds what we expect, the diff is a new deposit
  const currentBlock = await getProvider().getBlockNumber();
  let depositAmount = '0';
  let newDeposit = false;

  if (onChainBalanceWei > expectedOnChainWei) {
    const diffWei = onChainBalanceWei - expectedOnChainWei;
    depositAmount = ethers.formatEther(diffWei);

    // ── Dust Spam Protection ──────────────────────────────
    // Ignore deposits below our minimum stake tier (0.001 ETH).
    // Attackers can spam thousands of 1-wei transactions to bloat
    // the Transaction table and slow down balance/ELO queries.
    const MIN_DEPOSIT_WEI = ethers.parseEther('0.001'); // matches lowest stake tier
    if (diffWei < MIN_DEPOSIT_WEI) {
      console.log(`[DEPOSIT] Ignored dust transaction: ${depositAmount} ETH for user ${userId} (below 0.001 ETH minimum)`);
      return { newDeposit: false, depositAmount: '0', onChainBalance, gameBalance: '0' };
    }
    if (diffWei > 0n) {
      // Check we haven't already recorded this deposit (idempotency)
      const recentDeposit = await prisma.transaction.findFirst({
        where: {
          userId,
          type: 'DEPOSIT',
          status: 'CONFIRMED',
          createdAt: { gte: new Date(Date.now() - 60000) }, // within last minute
          amount: new Decimal(depositAmount),
        },
      });

      if (!recentDeposit) {
        await prisma.transaction.create({
          data: {
            userId,
            type: 'DEPOSIT',
            amount: new Decimal(depositAmount),
            status: 'CONFIRMED',
            blockNumber: BigInt(currentBlock),
            confirmedAt: new Date(),
            metadata: { source: 'on-chain-sync', onChainBalance },
          },
        });
        newDeposit = true;
      }
    }
  }

  // Update last synced block
  await prisma.user.update({
    where: { id: userId },
    data: { lastSyncedBlock: BigInt(currentBlock) },
  });

  // Calculate game balance (DB ledger)
  const { calculateBalance } = await import('./player.service');
  const gameBalance = await calculateBalance(userId);

  return {
    newDeposit,
    depositAmount,
    onChainBalance,
    gameBalance: gameBalance.toFixed(8),
  };
}

// ─────────────────────────────────────────────────────────
// Execute a real on-chain withdrawal
// ─────────────────────────────────────────────────────────

export async function executeWithdrawal(
  userId: string,
  encryptedKey: string,
  amount: number,
  toAddress: string
): Promise<{ txHash: string; status: 'CONFIRMED' | 'FAILED'; error?: string }> {
  // Decrypt the stored private key to create signer
  const signer = getGameWalletSigner(encryptedKey);
  const amountWei = ethers.parseEther(amount.toString());

  // Estimate gas
  const gasCost = await estimateTransferGas();

  // Check on-chain balance is sufficient for amount + gas
  const onChainBalance = await getOnChainBalanceWei(signer.address);
  if (onChainBalance < amountWei + gasCost) {
    return {
      txHash: '',
      status: 'FAILED',
      error: `Insufficient on-chain balance. On-chain: ${ethers.formatEther(onChainBalance)} ETH, Need: ${ethers.formatEther(amountWei + gasCost)} ETH (including gas)`,
    };
  }

  try {
    // Send the real transaction
    const tx = await signer.sendTransaction({
      to: toAddress,
      value: amountWei,
    });

    // Wait for 1 confirmation
    const receipt = await tx.wait(1);

    if (receipt && receipt.status === 1) {
      return { txHash: tx.hash, status: 'CONFIRMED' };
    } else {
      return { txHash: tx.hash, status: 'FAILED', error: 'Transaction reverted' };
    }
  } catch (err: any) {
    console.error('Withdrawal TX error:', err);
    return {
      txHash: '',
      status: 'FAILED',
      error: err.message || 'Transaction failed',
    };
  }
}

// ─────────────────────────────────────────────────────────
// Get combined balance info (DB + on-chain)
// ─────────────────────────────────────────────────────────

export async function getFullBalance(userId: string, gameWallet: string | null) {
  const { calculateBalance } = await import('./player.service');
  const [gameBalance, onChainBalance] = await Promise.all([
    calculateBalance(userId),
    gameWallet ? getOnChainBalanceWei(gameWallet).then(b => ethers.formatEther(b)) : Promise.resolve('0'),
  ]);

  return {
    gameBalance: gameBalance.toFixed(8),
    onChainBalance,
  };
}

// ─────────────────────────────────────────────────────────
// Helper: sum confirmed transactions by type
// ─────────────────────────────────────────────────────────

async function sumConfirmedTx(userId: string, type: string): Promise<number> {
  const result = await prisma.transaction.aggregate({
    where: { userId, type: type as any, status: 'CONFIRMED' },
    _sum: { amount: true },
  });
  return Number(result._sum.amount || 0);
}
