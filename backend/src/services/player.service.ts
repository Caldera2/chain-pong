import { ethers } from 'ethers';
import { prisma } from '../config/database';
import { NotFoundError, ConflictError, BadRequestError } from '../utils/errors';
import { Decimal } from '@prisma/client/runtime/library';
import { getGameWalletSigner, getTreasurySigner } from '../utils/wallet';

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

  // Check balance
  const price = Number(board.price);
  if (price > 0) {
    const balance = await calculateBalance(userId);
    if (balance < price) {
      throw new BadRequestError(`Insufficient balance. Need ${price} ETH, have ${balance.toFixed(6)} ETH`);
    }
  }

  // On-chain: transfer ETH from game wallet to treasury
  let onChainTxHash: string | undefined = txHash;
  if (price > 0) {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { encryptedKey: true, authMethod: true } });
      const treasury = getTreasurySigner();
      if (user?.encryptedKey && user.authMethod === 'EMAIL' && treasury) {
        const signer = getGameWalletSigner(user.encryptedKey);
        const tx = await signer.sendTransaction({
          to: treasury.address,
          value: ethers.parseEther(price.toString()),
        });
        await tx.wait(1);
        onChainTxHash = tx.hash;
      }
    } catch (err: any) {
      console.error('Board purchase on-chain transfer failed:', err.message);
      // DB purchase still proceeds — ETH deducted from game balance
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
