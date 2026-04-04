// ─────────────────────────────────────────────────────────
// Chain Pong — Payout Service (The "Money" Logic)
//
// Isolated, idempotent, error-resistant ETH payout handler.
// Cannot be triggered twice for the same match.
// ─────────────────────────────────────────────────────────

import { ethers } from 'ethers';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { getTreasurySigner, getProvider, getOnChainBalanceWei, estimateTransferGas } from '../utils/wallet';
import { treasuryGuard } from './treasury.guard';

// ─── Constants ───────────────────────────────────────────
const PROTOCOL_FEE_BPS = 250; // 2.5% (250 basis points)
const TX_STUCK_TIMEOUT_MS = 120_000; // 2 minutes before RBF
const RBF_GAS_MULTIPLIER = 150n;     // 50% higher gas for replacement
const MAX_RBF_ATTEMPTS = 2;          // Max replacement attempts

// ─── Nonce Manager ───────────────────────────────────────
// Ensures concurrent payouts don't collide on the same nonce.
// Uses an in-memory lock + provider.getTransactionCount('pending').

let _nonceLock: Promise<void> = Promise.resolve();
let _currentNonce: number | null = null;
let _nonceTimestamp = 0;
const NONCE_STALE_MS = 30_000; // re-fetch nonce if older than 30s

async function getNextNonce(signer: ethers.Wallet): Promise<number> {
  const now = Date.now();

  // If nonce is stale or uninitialized, re-fetch from chain
  if (_currentNonce === null || now - _nonceTimestamp > NONCE_STALE_MS) {
    const provider = getProvider();
    _currentNonce = await provider.getTransactionCount(signer.address, 'pending');
    _nonceTimestamp = now;
  }

  const nonce = _currentNonce;
  _currentNonce++;
  return nonce;
}

function withNonceLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = _nonceLock;
  let resolve: () => void;
  _nonceLock = new Promise<void>((r) => { resolve = r; });

  return prev.then(async () => {
    try {
      return await fn();
    } finally {
      resolve!();
    }
  });
}

// ─── Gas Strategy ────────────────────────────────────────
// Fetches current gas price and applies a 20% buffer to
// prevent stuck transactions during high traffic.

async function getOptimalGasPrice(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } | { gasPrice: bigint }> {
  const provider = getProvider();
  const feeData = await provider.getFeeData();

  // EIP-1559 supported (Base uses this)
  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    const buffer = 120n; // 20% buffer
    return {
      maxFeePerGas: (feeData.maxFeePerGas * buffer) / 100n,
      maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas * buffer) / 100n,
    };
  }

  // Legacy gas pricing fallback
  const gasPrice = feeData.gasPrice || ethers.parseUnits('0.1', 'gwei');
  return { gasPrice: (gasPrice * 120n) / 100n };
}

// ─── Idempotency Check ──────────────────────────────────
// Verifies this match hasn't already been paid out by
// checking both the Match.payoutTxHash and the Transaction table.

async function hasMatchBeenPaid(matchId: string): Promise<boolean> {
  const [match, existingPayout] = await Promise.all([
    prisma.match.findUnique({
      where: { id: matchId },
      select: { payoutTxHash: true, status: true },
    }),
    prisma.transaction.findFirst({
      where: {
        matchId,
        type: 'PAYOUT',
        status: { in: ['CONFIRMED', 'PENDING'] },
      },
    }),
  ]);

  if (match?.payoutTxHash) {
    console.warn(`[PAYOUT] Match ${matchId} already has payoutTxHash: ${match.payoutTxHash}`);
    return true;
  }

  if (existingPayout) {
    console.warn(`[PAYOUT] Match ${matchId} already has ${existingPayout.status} payout transaction: ${existingPayout.id}`);
    return true;
  }

  return false;
}

// ─── Core Payout Executor ────────────────────────────────
// The single function that handles all ETH disbursements.
//
// Guarantees:
// 1. Idempotent — won't pay the same match twice
// 2. Nonce-safe — concurrent payouts won't collide
// 3. Gas-optimized — 20% buffer on current gas price
// 4. Fully logged — txHash + details persisted to DB

export interface PayoutResult {
  success: boolean;
  txHash?: string;
  winnerPayout?: number;
  protocolFee?: number;
  error?: string;
}

export async function executeWinnerPayout(
  winnerAddress: string,
  potAmountEth: number,
  matchId: string
): Promise<PayoutResult> {
  // ── Step 1: Idempotency check ──────────────────────
  const alreadyPaid = await hasMatchBeenPaid(matchId);
  if (alreadyPaid) {
    return { success: false, error: `Match ${matchId} has already been paid out` };
  }

  // ── Step 2: Validate inputs ────────────────────────
  if (!ethers.isAddress(winnerAddress)) {
    return { success: false, error: `Invalid winner address: ${winnerAddress}` };
  }
  if (potAmountEth <= 0) {
    return { success: false, error: `Invalid pot amount: ${potAmountEth}` };
  }

  // ── Step 3: Calculate fee and payout ───────────────
  const protocolFee = potAmountEth * PROTOCOL_FEE_BPS / 10000;
  const winnerPayout = potAmountEth - protocolFee;

  // ── Step 4: Treasury guard checks ──────────────────
  const guardCheck = await treasuryGuard.prePayoutCheck(winnerPayout);
  if (!guardCheck.allowed) {
    console.error(`[PAYOUT] Treasury guard BLOCKED payout for match ${matchId}: ${guardCheck.reason}`);
    return { success: false, error: guardCheck.reason };
  }

  // ── Step 5: Get treasury signer ────────────────────
  const treasury = getTreasurySigner();
  if (!treasury) {
    return { success: false, error: 'Treasury signer not configured' };
  }

  // ── Step 6: Check treasury balance ─────────────────
  const treasuryBalance = await getOnChainBalanceWei(treasury.address);
  const payoutWei = ethers.parseEther(winnerPayout.toString());
  const gasCost = await estimateTransferGas();

  if (treasuryBalance < payoutWei + gasCost) {
    const balanceEth = ethers.formatEther(treasuryBalance);
    console.error(`[PAYOUT] Treasury balance too low: ${balanceEth} ETH. Need: ${winnerPayout} ETH + gas`);

    // Trigger low-balance alert
    await treasuryGuard.checkBalance();

    return { success: false, error: `Treasury balance insufficient: ${balanceEth} ETH` };
  }

  // ── Step 7: Execute transaction with nonce lock + RBF ──
  return withNonceLock(async () => {
    try {
      const nonce = await getNextNonce(treasury);
      const gasParams = await getOptimalGasPrice();

      console.log(`[PAYOUT] Sending ${winnerPayout} ETH to ${winnerAddress} for match ${matchId} (nonce: ${nonce})`);

      const tx = await treasury.sendTransaction({
        to: winnerAddress,
        value: payoutWei,
        nonce,
        gasLimit: 21000n,
        ...gasParams,
      });

      console.log(`[PAYOUT] TX broadcast: ${tx.hash} (match: ${matchId})`);

      // Wait for confirmation with RBF fallback if stuck
      const receipt = await waitWithRBF(treasury, tx, winnerAddress, payoutWei, nonce, matchId);

      if (!receipt || receipt.status === 0) {
        console.error(`[PAYOUT] TX reverted on-chain: ${receipt?.hash || tx.hash}`);
        _currentNonce = null;
        return { success: false, error: `Transaction reverted: ${receipt?.hash || tx.hash}` };
      }

      // ── Step 8: Record to permanent log ──────────
      const confirmedHash = receipt.hash || tx.hash;
      await recordPayoutLog(matchId, winnerAddress, winnerPayout, protocolFee, confirmedHash, receipt.blockNumber);

      // Track in circuit breaker
      treasuryGuard.recordPayout(winnerPayout);

      console.log(`[PAYOUT] ✅ Confirmed: ${confirmedHash} | Block: ${receipt.blockNumber} | Match: ${matchId} | Amount: ${winnerPayout} ETH`);

      return {
        success: true,
        txHash: confirmedHash,
        winnerPayout,
        protocolFee,
      };
    } catch (err: any) {
      console.error(`[PAYOUT] ❌ Failed for match ${matchId}:`, err.message);

      // Reset nonce cache on any failure
      _currentNonce = null;

      if (err.code === 'NONCE_EXPIRED' || err.message?.includes('nonce')) {
        console.warn('[PAYOUT] Nonce error detected — will re-fetch on next attempt');
      }

      return { success: false, error: err.message };
    }
  });
}

// ─── Replace-By-Fee (RBF) for Stuck Transactions ────────
// If a tx isn't mined within 2 minutes, resubmit with 50%
// higher gas on the same nonce. Idempotent — only the first
// mined tx counts; the other is discarded by the network.

async function waitWithRBF(
  signer: ethers.Wallet,
  originalTx: ethers.TransactionResponse,
  to: string,
  value: bigint,
  nonce: number,
  matchId: string
): Promise<ethers.TransactionReceipt | null> {
  let currentTx = originalTx;

  for (let attempt = 0; attempt <= MAX_RBF_ATTEMPTS; attempt++) {
    try {
      // Race: wait for confirmation vs timeout
      const receipt = await Promise.race([
        currentTx.wait(1),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), TX_STUCK_TIMEOUT_MS)),
      ]);

      if (receipt) return receipt;

      // Tx is stuck — attempt RBF
      if (attempt < MAX_RBF_ATTEMPTS) {
        console.warn(`[PAYOUT] TX ${currentTx.hash} stuck for ${TX_STUCK_TIMEOUT_MS / 1000}s — RBF attempt ${attempt + 1}`);

        const feeData = await getProvider().getFeeData();
        const bumpedGas = getBumpedGasParams(feeData);

        const replacementTx = await signer.sendTransaction({
          to,
          value,
          nonce,
          gasLimit: 21000n,
          ...bumpedGas,
        });

        console.log(`[PAYOUT] RBF TX broadcast: ${replacementTx.hash} (replacing ${currentTx.hash}, match: ${matchId})`);
        currentTx = replacementTx;
      }
    } catch (err: any) {
      // "replacement transaction underpriced" means original is still propagating — wait longer
      if (err.message?.includes('replacement') || err.message?.includes('underpriced')) {
        console.warn(`[PAYOUT] RBF underpriced — original tx still propagating, waiting...`);
        try {
          return await originalTx.wait(1);
        } catch {
          return null;
        }
      }
      // If the original tx was already mined, wait will throw TRANSACTION_REPLACED
      if (err.code === 'TRANSACTION_REPLACED' && err.receipt) {
        console.log(`[PAYOUT] TX replaced — confirmed: ${err.receipt.hash}`);
        return err.receipt;
      }
      throw err;
    }
  }

  // Final attempt: just wait on whatever the latest tx is
  return currentTx.wait(1);
}

function getBumpedGasParams(feeData: ethers.FeeData): Record<string, bigint> {
  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    return {
      maxFeePerGas: (feeData.maxFeePerGas * RBF_GAS_MULTIPLIER) / 100n,
      maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas * RBF_GAS_MULTIPLIER) / 100n,
    };
  }
  const gasPrice = feeData.gasPrice || ethers.parseUnits('0.1', 'gwei');
  return { gasPrice: (gasPrice * RBF_GAS_MULTIPLIER) / 100n };
}

// ─── Refund (for cancellations) ──────────────────────────
// Simplified version without fee calculation.

export async function executeRefund(
  playerAddress: string,
  amountEth: number,
  matchId: string
): Promise<PayoutResult> {
  // Check for duplicate refund
  const existingRefund = await prisma.transaction.findFirst({
    where: { matchId, type: 'STAKE_RETURN', status: { in: ['CONFIRMED', 'PENDING'] } },
  });
  if (existingRefund) {
    return { success: false, error: `Match ${matchId} already refunded` };
  }

  if (!ethers.isAddress(playerAddress)) {
    return { success: false, error: `Invalid address: ${playerAddress}` };
  }

  const treasury = getTreasurySigner();
  if (!treasury) return { success: false, error: 'Treasury signer not configured' };

  return withNonceLock(async () => {
    try {
      const nonce = await getNextNonce(treasury);
      const gasParams = await getOptimalGasPrice();
      const amountWei = ethers.parseEther(amountEth.toString());

      const tx = await treasury.sendTransaction({
        to: playerAddress,
        value: amountWei,
        nonce,
        gasLimit: 21000n,
        ...gasParams,
      });

      const receipt = await tx.wait(1);
      if (!receipt || receipt.status === 0) {
        _currentNonce = null;
        return { success: false, error: `Refund reverted: ${tx.hash}` };
      }

      console.log(`[REFUND] ✅ ${amountEth} ETH → ${playerAddress} | TX: ${tx.hash} | Match: ${matchId}`);

      return { success: true, txHash: tx.hash, winnerPayout: amountEth, protocolFee: 0 };
    } catch (err: any) {
      console.error(`[REFUND] ❌ Failed for match ${matchId}:`, err.message);
      _currentNonce = null;
      return { success: false, error: err.message };
    }
  });
}

// ─── Permanent Payout Log ────────────────────────────────
// Records the payout + protocol fee to the Transaction table
// and updates the Match record with the txHash.

async function recordPayoutLog(
  matchId: string,
  winnerAddress: string,
  winnerPayout: number,
  protocolFee: number,
  txHash: string,
  blockNumber: number
) {
  await prisma.$transaction([
    // Update match with payout hash
    prisma.match.update({
      where: { id: matchId },
      data: { payoutTxHash: txHash, onChainSynced: true },
    }),

    // Winner payout transaction record
    prisma.transaction.create({
      data: {
        userId: (await getMatchWinnerId(matchId))!,
        type: 'PAYOUT',
        amount: new Decimal(winnerPayout),
        status: 'CONFIRMED',
        txHash,
        matchId,
        blockNumber: BigInt(blockNumber),
        metadata: {
          winnerAddress,
          potAmount: (winnerPayout + protocolFee).toString(),
          protocolFee: protocolFee.toString(),
          feeRate: '2.5%',
        },
        confirmedAt: new Date(),
      },
    }),

    // Protocol fee record (audit trail)
    ...(protocolFee > 0
      ? [
          prisma.transaction.create({
            data: {
              userId: (await getMatchWinnerId(matchId))!,
              type: 'PROTOCOL_FEE',
              amount: new Decimal(protocolFee),
              status: 'CONFIRMED',
              matchId,
              metadata: { feeRate: '2.5%', potAmount: (winnerPayout + protocolFee).toString() },
              confirmedAt: new Date(),
            },
          }),
        ]
      : []),
  ]);
}

async function getMatchWinnerId(matchId: string): Promise<string | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { winnerId: true },
  });
  return match?.winnerId || null;
}
