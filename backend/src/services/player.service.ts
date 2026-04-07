import { ethers } from 'ethers';
import { prisma } from '../config/database';
import { NotFoundError, ConflictError, BadRequestError } from '../utils/errors';
import { Decimal } from '@prisma/client/runtime/library';
import { getGameWalletSigner } from '../utils/wallet';
import { executeWinnerPayout } from './payout.service';
import { env } from '../config/env';

// ─────────────────────────────────────────────────────────
// Get Player Profile
// ─────────────────────────────────────────────────────────

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      stats: true,
      ownedBoards: {
        include: { board: true },
        orderBy: { purchasedAt: 'asc' },
      },
    },
  });

  if (!user) throw new NotFoundError('Player not found');

  // Calculate effective balance
  const balance = await calculateBalance(userId);

  // Recent match history
  const recentMatches = await prisma.match.findMany({
    where: {
      status: 'COMPLETED',
      OR: [{ player1Id: userId }, { player2Id: userId }],
    },
    orderBy: { endedAt: 'desc' },
    take: 10,
    include: {
      player1: { select: { id: true, username: true, avatar: true } },
      player2: { select: { id: true, username: true, avatar: true } },
    },
  });

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    authMethod: user.authMethod,
    walletAddress: user.walletAddress,
    gameWallet: user.gameWallet,
    avatar: user.avatar,
    xHandle: user.xHandle,
    farcasterName: user.farcasterName,
    telegramUser: user.telegramUser,
    createdAt: user.createdAt.toISOString(),
    stats: user.stats ? {
      wins: user.stats.wins,
      losses: user.stats.losses,
      gamesPlayed: user.stats.gamesPlayed,
      totalEarnings: user.stats.totalEarnings.toString(),
      totalLost: user.stats.totalLost.toString(),
      winStreak: user.stats.winStreak,
      bestStreak: user.stats.bestStreak,
      rating: user.stats.rating,
      winRate: user.stats.gamesPlayed > 0
        ? ((user.stats.wins / user.stats.gamesPlayed) * 100).toFixed(1)
        : '0.0',
    } : null,
    balance: balance.toFixed(8),
    boards: user.ownedBoards.map((ub) => ({
      id: ub.board.id,
      name: ub.board.name,
      color: ub.board.color,
      perk: ub.board.perk,
      perkIcon: ub.board.perkIcon,
      rarity: ub.board.rarity,
      purchasedAt: ub.purchasedAt.toISOString(),
    })),
    recentMatches: recentMatches.map((m) => ({
      id: m.id,
      mode: m.mode,
      opponent: m.player1Id === userId
        ? m.player2 ? { username: m.player2.username, avatar: m.player2.avatar } : { username: 'Computer', avatar: '🤖' }
        : { username: m.player1.username, avatar: m.player1.avatar },
      won: m.winnerId === userId,
      myScore: m.player1Id === userId ? m.player1Score : m.player2Score,
      opponentScore: m.player1Id === userId ? m.player2Score : m.player1Score,
      stakeAmount: m.stakeAmount.toString(),
      endedAt: m.endedAt?.toISOString() || null,
    })),
  };
}

// ─────────────────────────────────────────────────────────
// Update Profile
// ─────────────────────────────────────────────────────────

export async function updateProfile(userId: string, updates: { username?: string; avatar?: string }) {
  if (updates.username) {
    const existing = await prisma.user.findFirst({
      where: { username: updates.username, id: { not: userId } },
    });
    if (existing) throw new ConflictError('Username already taken');
  }

  return prisma.user.update({
    where: { id: userId },
    data: {
      ...(updates.username && { username: updates.username }),
      ...(updates.avatar && { avatar: updates.avatar }),
    },
    select: {
      id: true,
      username: true,
      avatar: true,
    },
  });
}

// ─────────────────────────────────────────────────────────
// Get Player Balance
// ─────────────────────────────────────────────────────────

export async function calculateBalance(userId: string): Promise<number> {
  const [deposits, payouts, stakeReturns, stakeLocks, withdrawals, purchases] = await Promise.all([
    sumTransactions(userId, 'DEPOSIT'),
    sumTransactions(userId, 'PAYOUT'),
    sumTransactions(userId, 'STAKE_RETURN'),
    sumTransactions(userId, 'STAKE_LOCK'),
    sumTransactions(userId, 'WITHDRAWAL'),
    sumTransactions(userId, 'BOARD_PURCHASE'),
  ]);

  return deposits + payouts + stakeReturns - stakeLocks - withdrawals - purchases;
}

async function sumTransactions(userId: string, type: string): Promise<number> {
  const result = await prisma.transaction.aggregate({
    where: { userId, type: type as any, status: 'CONFIRMED' },
    _sum: { amount: true },
  });
  return Number(result._sum.amount || 0);
}

// ─────────────────────────────────────────────────────────
// Get Claimable Earnings (EARNINGS - CLAIM transactions)
//
// This is the amount the winner has earned from matches but
// has NOT yet withdrawn. Money stays in treasury until they
// go to the Claim Earnings page and claim it.
// ─────────────────────────────────────────────────────────

export async function calculateClaimableBalance(userId: string): Promise<number> {
  const [earnings, claims] = await Promise.all([
    sumTransactions(userId, 'EARNINGS'),
    sumTransactions(userId, 'CLAIM'),
  ]);
  return Math.max(0, earnings - claims);
}

// ─────────────────────────────────────────────────────────
// Claim Earnings — send accumulated winnings from treasury
//
// Flow: Winner clicks "Claim" → backend verifies claimable
// amount → sends ETH from treasury to winner's wallet →
// records CLAIM transaction.
// ─────────────────────────────────────────────────────────

export async function claimEarnings(userId: string): Promise<{
  success: boolean;
  txHash?: string;
  amount?: number;
  error?: string;
}> {
  // 1. Calculate claimable amount
  const claimable = await calculateClaimableBalance(userId);
  if (claimable <= 0) {
    return { success: false, error: 'No earnings to claim' };
  }

  // 2. Get winner's wallet address
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { gameWallet: true, walletAddress: true, authMethod: true },
  });
  const toAddress = user?.gameWallet || user?.walletAddress;
  if (!toAddress) {
    return { success: false, error: 'No wallet address found. Connect a wallet first.' };
  }

  // 3. Send ETH from treasury to winner
  try {
    const result = await executeWinnerPayout(toAddress, claimable, `claim-${userId}-${Date.now()}`);

    if (!result.success) {
      return { success: false, error: result.error || 'Transaction failed' };
    }

    // 4. Record CLAIM transaction
    await prisma.transaction.create({
      data: {
        userId,
        type: 'CLAIM',
        amount: new Decimal(claimable),
        status: 'CONFIRMED',
        txHash: result.txHash,
        metadata: { toAddress },
        confirmedAt: new Date(),
      },
    });

    console.log(`[CLAIM] ${claimable} ETH sent to ${toAddress} for user ${userId}`);
    return { success: true, txHash: result.txHash, amount: claimable };
  } catch (err: any) {
    console.error(`[CLAIM] Failed for user ${userId}:`, err.message);
    return { success: false, error: err.message || 'Claim failed' };
  }
}

// ─────────────────────────────────────────────────────────
// Get Player's Owned Boards
// ─────────────────────────────────────────────────────────

export async function getOwnedBoards(userId: string) {
  return prisma.userBoard.findMany({
    where: { userId },
    include: { board: true },
    orderBy: { purchasedAt: 'asc' },
  });
}

// ─────────────────────────────────────────────────────────
// Purchase a Board
// ─────────────────────────────────────────────────────────

export async function purchaseBoard(userId: string, boardId: string, txHash?: string) {
  // Check board exists
  const board = await prisma.board.findUnique({ where: { id: boardId } });
  if (!board) throw new NotFoundError('Board not found');
  if (!board.isActive) throw new BadRequestError('Board is not available');

  // Check not already owned
  const alreadyOwned = await prisma.userBoard.findUnique({
    where: { userId_boardId: { userId, boardId } },
  });
  if (alreadyOwned) throw new ConflictError('You already own this board');

  const price = Number(board.price);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { encryptedKey: true, authMethod: true },
  });
  const isWalletUser = user?.authMethod === 'WALLET';
  const hasTxHash = !!txHash; // Wallet user already paid via MetaMask

  // ── Balance check ─────────────────────────────────────
  // Skip for wallet users who already sent ETH (txHash proves on-chain payment).
  // Only check game wallet balance for email users who pay from their game wallet.
  if (price > 0 && !hasTxHash) {
    const balance = await calculateBalance(userId);
    if (balance < price) {
      throw new BadRequestError(`Insufficient balance. Need ${price} ETH, have ${balance.toFixed(6)} ETH`);
    }
  }

  // ── On-chain transfer ─────────────────────────────────
  // Wallet users: ETH already sent via MetaMask — txHash passed from frontend.
  // Email users: backend sends ETH from their game wallet to treasury.
  let onChainTxHash: string | undefined = txHash;
  if (price > 0 && !isWalletUser) {
    try {
      if (user?.encryptedKey) {
        const signer = getGameWalletSigner(user.encryptedKey);
        const tx = await signer.sendTransaction({
          to: env.TREASURY_ADDRESS,
          value: ethers.parseEther(price.toString()),
        });
        await tx.wait(1);
        onChainTxHash = tx.hash;
      }
    } catch (err: any) {
      console.error('Board purchase on-chain transfer failed:', err.message);
    }
  }

  // Create ownership + transaction in a single db transaction
  const [userBoard] = await prisma.$transaction([
    prisma.userBoard.create({
      data: { userId, boardId, txHash: onChainTxHash },
    }),
    ...(price > 0 ? [
      prisma.transaction.create({
        data: {
          userId,
          type: 'BOARD_PURCHASE',
          amount: new Decimal(price),
          status: 'CONFIRMED',
          txHash: onChainTxHash,
          metadata: { boardId, boardName: board.name },
          confirmedAt: new Date(),
        },
      }),
    ] : []),
  ]);

  return { userBoard, board };
}

// ─────────────────────────────────────────────────────────
// Create Pending Purchase — Pre-register intent before MetaMask
//
// Called BEFORE MetaMask opens. Creates a PENDING transaction
// record so the webhook can match incoming ETH to a board
// purchase even if the frontend crashes or times out.
// ─────────────────────────────────────────────────────────

export async function createPendingPurchase(userId: string, boardId: string) {
  const board = await prisma.board.findUnique({ where: { id: boardId } });
  if (!board) throw new NotFoundError('Board not found');
  if (!board.isActive) throw new BadRequestError('Board is not available');

  const alreadyOwned = await prisma.userBoard.findUnique({
    where: { userId_boardId: { userId, boardId } },
  });
  if (alreadyOwned) throw new ConflictError('You already own this board');

  const price = Number(board.price);

  // Create a PENDING transaction so the webhook can pick it up
  const pendingTx = await prisma.transaction.create({
    data: {
      userId,
      type: 'BOARD_PURCHASE',
      amount: new Decimal(price),
      status: 'PENDING',
      metadata: { boardId, boardName: board.name, pendingPurchase: true },
    },
  });

  return { pendingTxId: pendingTx.id, boardId: board.id, boardName: board.name, price };
}

// ─────────────────────────────────────────────────────────
// Sync Purchases — Reconcile missed board purchases
//
// When a wallet user sends ETH via MetaMask but the API call
// times out, the board ownership record is never created.
// This endpoint checks the chain for any txHashes the frontend
// reports and reconciles ownership records.
// ─────────────────────────────────────────────────────────

export async function syncPurchases(
  userId: string,
  pendingTxHashes: string[]
): Promise<{ reconciled: string[]; alreadyOwned: string[]; failed: string[] }> {
  const reconciled: string[] = [];
  const alreadyOwned: string[] = [];
  const failed: string[] = [];

  if (!pendingTxHashes.length) return { reconciled, alreadyOwned, failed };

  const provider = new ethers.JsonRpcProvider(env.RPC_URL);

  for (const txHash of pendingTxHashes.slice(0, 10)) { // Cap at 10 to prevent abuse
    try {
      // Check if we already recorded this tx as a purchase
      const existingTx = await prisma.transaction.findFirst({
        where: { txHash, type: 'BOARD_PURCHASE', userId },
      });
      if (existingTx) {
        alreadyOwned.push(txHash);
        continue;
      }

      // Verify the transaction exists on-chain and is confirmed
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt || receipt.status !== 1) {
        failed.push(txHash);
        continue;
      }

      // Get the transaction to verify it was sent to treasury
      const tx = await provider.getTransaction(txHash);
      if (!tx) {
        failed.push(txHash);
        continue;
      }

      const toAddress = tx.to?.toLowerCase();
      const treasuryAddress = env.TREASURY_ADDRESS?.toLowerCase();
      if (!treasuryAddress || toAddress !== treasuryAddress) {
        failed.push(txHash);
        continue;
      }

      // Find which board this amount matches
      const valueEth = parseFloat(ethers.formatEther(tx.value));
      const matchingBoard = await prisma.board.findFirst({
        where: {
          isActive: true,
          price: { gte: new Decimal(valueEth * 0.99), lte: new Decimal(valueEth * 1.01) }, // 1% tolerance for gas
        },
      });

      if (!matchingBoard) {
        failed.push(txHash);
        continue;
      }

      // Check if user already owns this board
      const owned = await prisma.userBoard.findUnique({
        where: { userId_boardId: { userId, boardId: matchingBoard.id } },
      });
      if (owned) {
        alreadyOwned.push(txHash);
        continue;
      }

      // Reconcile: create ownership + transaction record
      await prisma.$transaction([
        prisma.userBoard.create({
          data: { userId, boardId: matchingBoard.id, txHash },
        }),
        prisma.transaction.create({
          data: {
            userId,
            type: 'BOARD_PURCHASE',
            amount: new Decimal(valueEth),
            status: 'CONFIRMED',
            txHash,
            metadata: { boardId: matchingBoard.id, boardName: matchingBoard.name, reconciled: true },
            confirmedAt: new Date(),
          },
        }),
      ]);

      console.log(`[SYNC-PURCHASE] Reconciled board "${matchingBoard.name}" for user ${userId} tx ${txHash}`);
      reconciled.push(txHash);
    } catch (err: any) {
      console.error(`[SYNC-PURCHASE] Error processing tx ${txHash}:`, err.message);
      failed.push(txHash);
    }
  }

  return { reconciled, alreadyOwned, failed };
}

// ─────────────────────────────────────────────────────────
// Get Transaction History
// ─────────────────────────────────────────────────────────

export async function getTransactions(userId: string, page: number = 1, limit: number = 20) {
  const offset = (page - 1) * limit;
  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.transaction.count({ where: { userId } }),
  ]);

  return {
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount.toString(),
      status: t.status,
      txHash: t.txHash,
      matchId: t.matchId,
      createdAt: t.createdAt.toISOString(),
      confirmedAt: t.confirmedAt?.toISOString() || null,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}
