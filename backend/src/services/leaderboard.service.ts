import { prisma } from '../config/database';
import { LeaderboardEntryDTO } from '../types';

// ─────────────────────────────────────────────────────────
// Get Global Leaderboard
// Sorted by wins DESC, then createdAt ASC (earlier signup = higher on tie)
// ─────────────────────────────────────────────────────────

export async function getLeaderboard(
  page: number = 1,
  limit: number = 50,
  sortBy: 'wins' | 'earnings' | 'rating' = 'wins',
  requesterId?: string
): Promise<{ entries: LeaderboardEntryDTO[]; total: number; page: number; totalPages: number }> {

  const offset = (page - 1) * limit;

  // Build sort order
  const orderBy = buildSortOrder(sortBy);

  // Count total players with at least 1 game
  const total = await prisma.playerStats.count({
    where: { gamesPlayed: { gt: 0 } },
  });

  const totalPages = Math.ceil(total / limit);

  // Fetch ranked players
  const stats = await prisma.playerStats.findMany({
    where: { gamesPlayed: { gt: 0 } },
    orderBy,
    skip: offset,
    take: limit,
    include: {
      user: {
        select: {
          id: true,
          username: true,
          avatar: true,
          createdAt: true,
        },
      },
    },
  });

  // Build entries with rank
  const entries: LeaderboardEntryDTO[] = stats.map((s, i) => ({
    rank: offset + i + 1,
    userId: s.user.id,
    username: s.user.username,
    avatar: s.user.avatar,
    wins: s.wins,
    losses: s.losses,
    earnings: s.totalEarnings.toString(),
    winStreak: s.winStreak,
    rating: s.rating,
    isYou: s.user.id === requesterId,
  }));

  return { entries, total, page, totalPages };
}

// ─────────────────────────────────────────────────────────
// Get a specific player's rank
// ─────────────────────────────────────────────────────────

export async function getPlayerRank(userId: string): Promise<number> {
  const playerStats = await prisma.playerStats.findUnique({
    where: { userId },
    include: { user: { select: { createdAt: true } } },
  });

  if (!playerStats || playerStats.gamesPlayed === 0) return 0;

  // Count players ranked higher
  const higherRanked = await prisma.playerStats.count({
    where: {
      gamesPlayed: { gt: 0 },
      OR: [
        { wins: { gt: playerStats.wins } },
        {
          wins: playerStats.wins,
          user: { createdAt: { lt: playerStats.user.createdAt } },
        },
      ],
    },
  });

  return higherRanked + 1;
}

// ─────────────────────────────────────────────────────────
// Get Top N (for lobby mini-leaderboard)
// ─────────────────────────────────────────────────────────

export async function getTopPlayers(limit: number = 5, requesterId?: string): Promise<LeaderboardEntryDTO[]> {
  const stats = await prisma.playerStats.findMany({
    where: { gamesPlayed: { gt: 0 } },
    orderBy: [
      { wins: 'desc' },
      { user: { createdAt: 'asc' } },
    ],
    take: limit,
    include: {
      user: {
        select: { id: true, username: true, avatar: true },
      },
    },
  });

  return stats.map((s, i) => ({
    rank: i + 1,
    userId: s.user.id,
    username: s.user.username,
    avatar: s.user.avatar,
    wins: s.wins,
    losses: s.losses,
    earnings: s.totalEarnings.toString(),
    winStreak: s.winStreak,
    rating: s.rating,
    isYou: s.user.id === requesterId,
  }));
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function buildSortOrder(sortBy: 'wins' | 'earnings' | 'rating') {
  switch (sortBy) {
    case 'earnings':
      return [
        { totalEarnings: 'desc' as const },
        { user: { createdAt: 'asc' as const } },
      ];
    case 'rating':
      return [
        { rating: 'desc' as const },
        { user: { createdAt: 'asc' as const } },
      ];
    case 'wins':
    default:
      return [
        { wins: 'desc' as const },
        { user: { createdAt: 'asc' as const } },
      ];
  }
}
