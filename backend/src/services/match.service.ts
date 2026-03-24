import { Decimal } from '@prisma/client/runtime/library';
import { ethers } from 'ethers';
import { prisma } from '../config/database';
import { BadRequestError, NotFoundError, InsufficientBalanceError, ForbiddenError } from '../utils/errors';
import { getGameWalletSigner, getTreasurySigner } from '../utils/wallet';
import { getStakingContract, isContractConfigured, matchIdToBytes32, isContractPaused } from '../utils/contract';

const VALID_STAKES = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05];
const WIN_SCORE = 7; // first to 7 wins
const PROTOCOL_FEE_BPS = 250; // 2.5% protocol fee (250 basis points)

// ─── ELO Constants ───────────────────────────────────
const K_FACTOR = 32;

// ─────────────────────────────────────────────────────────
// Create a PvE (vs Computer) match
// ─────────────────────────────────────────────────────────

export async function createComputerMatch(
  userId: string,
  boardId: string,
  difficulty: 'EASY' | 'MEDIUM' | 'HARD'
) {
  // Verify user owns the board
  await verifyBoardOwnership(userId, boardId);

  const match = await prisma.match.create({
    data: {
      mode: 'COMPUTER',
      status: 'IN_PROGRESS',
      player1Id: userId,
      player1Board: boardId,
      difficulty,
      stakeAmount: 0,
      potAmount: 0,
      startedAt: new Date(),
    },
  });

  return match;
}

// ─────────────────────────────────────────────────────────
// Create a PvP match (player joins queue → gets matched)
// ─────────────────────────────────────────────────────────

export async function createPvpMatch(
  userId: string,
  boardId: string,
  stakeAmount: number
) {
  if (!VALID_STAKES.includes(stakeAmount)) {
    throw new BadRequestError(`Invalid stake amount. Valid: ${VALID_STAKES.join(', ')}`);
  }

  await verifyBoardOwnership(userId, boardId);
  await verifyBalance(userId, stakeAmount);

  // Create a PENDING match waiting for opponent
  const match = await prisma.match.create({
    data: {
      mode: 'PVP',
      status: 'PENDING',
      player1Id: userId,
      player1Board: boardId,
      stakeAmount: new Decimal(stakeAmount),
      potAmount: new Decimal(stakeAmount),
    },
  });

  // Lock player's stake in DB
  await createStakeLockTransaction(userId, stakeAmount, match.id);

  // On-chain: stake on the contract if configured
  if (isContractConfigured()) {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { encryptedKey: true, authMethod: true } });
      if (user?.encryptedKey && user.authMethod === 'EMAIL') {
        const signer = getGameWalletSigner(user.encryptedKey);
        const contract = getStakingContract(signer);
        const matchIdBytes = matchIdToBytes32(match.id);

        const tx = await contract!.createMatch(matchIdBytes, {
          value: ethers.parseEther(stakeAmount.toString()),
        });
        const receipt = await tx.wait(1);

        await prisma.match.update({
          where: { id: match.id },
          data: {
            stakeTxHash: tx.hash,
            onChainMatchId: matchIdBytes,
            onChainSynced: true,
          },
        });
      }
    } catch (err: any) {
      console.error('On-chain createMatch failed:', err.message);
      // DB match is still valid — on-chain sync can be retried
    }
  }

  return match;
}

// ─────────────────────────────────────────────────────────
// Join an existing PvP match
// ─────────────────────────────────────────────────────────

export async function joinPvpMatch(
  matchId: string,
  userId: string,
  boardId: string
) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });

  if (!match) throw new NotFoundError('Match not found');
  if (match.status !== 'PENDING') throw new BadRequestError('Match is not available');
  if (match.player1Id === userId) throw new BadRequestError('Cannot join your own match');

  const stakeAmount = Number(match.stakeAmount);

  await verifyBoardOwnership(userId, boardId);
  await verifyBalance(userId, stakeAmount);

  // Lock opponent's stake and update match
  await createStakeLockTransaction(userId, stakeAmount, matchId);

  const updated = await prisma.match.update({
    where: { id: matchId },
    data: {
      player2Id: userId,
      player2Board: boardId,
      status: 'MATCHED',
      potAmount: new Decimal(stakeAmount * 2),
    },
    include: {
      player1: { select: { id: true, username: true, avatar: true } },
      player2: { select: { id: true, username: true, avatar: true } },
    },
  });

  // On-chain: join match on the contract if configured
  if (isContractConfigured() && match.onChainMatchId) {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { encryptedKey: true, authMethod: true } });
      if (user?.encryptedKey && user.authMethod === 'EMAIL') {
        const signer = getGameWalletSigner(user.encryptedKey);
        const contract = getStakingContract(signer);

        const tx = await contract!.joinMatch(match.onChainMatchId, {
          value: ethers.parseEther(stakeAmount.toString()),
        });
        await tx.wait(1);
      }
    } catch (err: any) {
      console.error('On-chain joinMatch failed:', err.message);
    }
  }

  return updated;
}

// ─────────────────────────────────────────────────────────
// Submit match result (server-authoritative)
// ─────────────────────────────────────────────────────────

export async function submitMatchResult(
  matchId: string,
  player1Score: number,
  player2Score: number,
  submitterId: string,
  perkUsed: boolean = false
) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      player1: { include: { stats: true } },
      player2: { include: { stats: true } },
    },
  });

  if (!match) throw new NotFoundError('Match not found');
  if (match.status === 'COMPLETED') throw new BadRequestError('Match already completed');
  if (match.player1Id !== submitterId && match.player2Id !== submitterId) {
    throw new ForbiddenError('You are not a participant in this match');
  }

  // Determine winner
  const winnerId = player1Score > player2Score ? match.player1Id : match.player2Id;
  const loserId = winnerId === match.player1Id ? match.player2Id : match.player1Id;
  const stakeAmount = Number(match.stakeAmount);
  const potAmount = Number(match.potAmount);
  const isPvp = match.mode === 'PVP';

  // Update match record
  const completed = await prisma.match.update({
    where: { id: matchId },
    data: {
      player1Score,
      player2Score,
      winnerId,
      status: 'COMPLETED',
      endedAt: new Date(),
      ...(submitterId === match.player1Id ? { player1Perk: perkUsed } : { player2Perk: perkUsed }),
    },
  });

  // ─── Update winner stats ────────────────────────────
  const winnerStats = winnerId === match.player1Id ? match.player1?.stats : match.player2?.stats;
  if (winnerStats) {
    const newStreak = winnerStats.winStreak + 1;
    await prisma.playerStats.update({
      where: { userId: winnerId! },
      data: {
        wins: { increment: 1 },
        gamesPlayed: { increment: 1 },
        totalEarnings: isPvp ? { increment: new Decimal(potAmount - (potAmount * PROTOCOL_FEE_BPS / 10000)) } : undefined,
        winStreak: newStreak,
        bestStreak: Math.max(newStreak, winnerStats.bestStreak),
        rating: isPvp && match.player2?.stats
          ? calculateNewRating(winnerStats.rating, match.player2.stats.rating, true)
          : winnerStats.rating,
      },
    });

    // Create payout transaction for PvP winner (minus protocol fee)
    if (isPvp && potAmount > 0) {
      const protocolFee = potAmount * PROTOCOL_FEE_BPS / 10000; // 2.5%
      const winnerPayout = potAmount - protocolFee;
      let payoutTxHash: string | undefined;

      // On-chain: settle match on the contract if configured
      if (isContractConfigured() && match.onChainMatchId) {
        try {
          const treasury = getTreasurySigner();
          if (treasury) {
            const contract = getStakingContract(treasury);
            // Get winner's game wallet address
            const winner = await prisma.user.findUnique({
              where: { id: winnerId! },
              select: { gameWallet: true, walletAddress: true },
            });
            const winnerAddress = winner?.gameWallet || winner?.walletAddress;

            if (winnerAddress && contract) {
              const tx = await contract.settleMatch(match.onChainMatchId, winnerAddress);
              const receipt = await tx.wait(1);
              payoutTxHash = tx.hash;

              await prisma.match.update({
                where: { id: matchId },
                data: { payoutTxHash: tx.hash, onChainSynced: true },
              });
            }
          }
        } catch (err: any) {
          console.error('On-chain settleMatch failed:', err.message);
        }
      }

      // Winner payout (pot minus fee)
      await prisma.transaction.create({
        data: {
          userId: winnerId!,
          type: 'PAYOUT',
          amount: new Decimal(winnerPayout),
          status: 'CONFIRMED',
          matchId,
          txHash: payoutTxHash,
          confirmedAt: new Date(),
        },
      });

      // Protocol fee transaction (credited to treasury/platform)
      if (protocolFee > 0) {
        await prisma.transaction.create({
          data: {
            userId: winnerId!, // tracked against the match for audit
            type: 'PROTOCOL_FEE',
            amount: new Decimal(protocolFee),
            status: 'CONFIRMED',
            matchId,
            metadata: { feeRate: '2.5%', potAmount: potAmount.toString() },
            confirmedAt: new Date(),
          },
        });
      }
    }
  }

  // ─── Update loser stats ─────────────────────────────
  if (loserId && isPvp) {
    const loserStats = loserId === match.player1Id ? match.player1?.stats : match.player2?.stats;
    if (loserStats) {
      await prisma.playerStats.update({
        where: { userId: loserId },
        data: {
          losses: { increment: 1 },
          gamesPlayed: { increment: 1 },
          totalLost: { increment: new Decimal(stakeAmount) },
          winStreak: 0,
          rating: match.player1?.stats && match.player2?.stats
            ? calculateNewRating(loserStats.rating, winnerStats!.rating, false)
            : loserStats.rating,
        },
      });
    }
  } else if (!isPvp) {
    // PvE — update player stats (no earnings)
    const isWin = winnerId === match.player1Id;
    await prisma.playerStats.update({
      where: { userId: match.player1Id },
      data: {
        ...(isWin ? { wins: { increment: 1 } } : { losses: { increment: 1 } }),
        gamesPlayed: { increment: 1 },
        winStreak: isWin ? { increment: 1 } : 0,
        ...(isWin && winnerStats ? { bestStreak: Math.max(winnerStats.winStreak + 1, winnerStats.bestStreak) } : {}),
      },
    });
  }

  return completed;
}

// ─────────────────────────────────────────────────────────
// Cancel a pending match
// ─────────────────────────────────────────────────────────

export async function cancelMatch(matchId: string, userId: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) throw new NotFoundError('Match not found');
  if (match.player1Id !== userId) throw new ForbiddenError('Only the match creator can cancel');
  if (match.status !== 'PENDING') throw new BadRequestError('Only pending matches can be cancelled');

  // Return staked amount
  const stakeAmount = Number(match.stakeAmount);
  if (stakeAmount > 0) {
    await prisma.transaction.create({
      data: {
        userId,
        type: 'STAKE_RETURN',
        amount: new Decimal(stakeAmount),
        status: 'CONFIRMED',
        matchId,
        confirmedAt: new Date(),
      },
    });
  }

  // On-chain: cancel match on the contract if configured
  if (isContractConfigured() && match.onChainMatchId) {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { encryptedKey: true, authMethod: true } });
      if (user?.encryptedKey && user.authMethod === 'EMAIL') {
        const signer = getGameWalletSigner(user.encryptedKey);
        const contract = getStakingContract(signer);
        const tx = await contract!.cancelMatch(match.onChainMatchId);
        await tx.wait(1);
      }
    } catch (err: any) {
      console.error('On-chain cancelMatch failed:', err.message);
    }
  }

  return prisma.match.update({
    where: { id: matchId },
    data: { status: 'CANCELLED' },
  });
}

// ─────────────────────────────────────────────────────────
// Get match details
// ─────────────────────────────────────────────────────────

export async function getMatch(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      player1: { select: { id: true, username: true, avatar: true } },
      player2: { select: { id: true, username: true, avatar: true } },
      winner: { select: { id: true, username: true } },
    },
  });
  if (!match) throw new NotFoundError('Match not found');
  return match;
}

// ─────────────────────────────────────────────────────────
// Get player match history
// ─────────────────────────────────────────────────────────

export async function getMatchHistory(userId: string, page: number = 1, limit: number = 20) {
  const offset = (page - 1) * limit;
  const [matches, total] = await Promise.all([
    prisma.match.findMany({
      where: {
        status: 'COMPLETED',
        OR: [{ player1Id: userId }, { player2Id: userId }],
      },
      orderBy: { endedAt: 'desc' },
      skip: offset,
      take: limit,
      include: {
        player1: { select: { id: true, username: true, avatar: true } },
        player2: { select: { id: true, username: true, avatar: true } },
      },
    }),
    prisma.match.count({
      where: {
        status: 'COMPLETED',
        OR: [{ player1Id: userId }, { player2Id: userId }],
      },
    }),
  ]);

  return { matches, total, page, totalPages: Math.ceil(total / limit) };
}

// ─────────────────────────────────────────────────────────
// Find available PvP matches for matchmaking
// ─────────────────────────────────────────────────────────

export async function findAvailableMatches(stakeAmount: number, excludeUserId: string) {
  return prisma.match.findMany({
    where: {
      mode: 'PVP',
      status: 'PENDING',
      stakeAmount: new Decimal(stakeAmount),
      player1Id: { not: excludeUserId },
    },
    orderBy: { createdAt: 'asc' }, // FIFO
    take: 10,
    include: {
      player1: {
        select: { id: true, username: true, avatar: true },
        include: { stats: { select: { rating: true, wins: true, losses: true } } },
      },
    },
  });
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

async function verifyBoardOwnership(userId: string, boardId: string) {
  const owns = await prisma.userBoard.findUnique({
    where: { userId_boardId: { userId, boardId } },
  });
  if (!owns) throw new BadRequestError(`You don't own this board`);
}

async function verifyBalance(userId: string, amount: number) {
  // Calculate effective balance: total earnings - total lost - pending stakes
  const stats = await prisma.playerStats.findUnique({ where: { userId } });
  if (!stats) throw new NotFoundError('Player stats not found');

  const pendingStakes = await prisma.transaction.aggregate({
    where: {
      userId,
      type: 'STAKE_LOCK',
      status: 'CONFIRMED',
    },
    _sum: { amount: true },
  });

  const pendingReturns = await prisma.transaction.aggregate({
    where: {
      userId,
      type: { in: ['STAKE_RETURN', 'PAYOUT'] },
      status: 'CONFIRMED',
    },
    _sum: { amount: true },
  });

  const locked = Number(pendingStakes._sum.amount || 0);
  const returned = Number(pendingReturns._sum.amount || 0);
  const effectiveBalance = Number(stats.totalEarnings) - Number(stats.totalLost) + returned - locked;

  if (effectiveBalance < amount) {
    throw new InsufficientBalanceError(
      `Insufficient balance. Need ${amount} ETH, have ${effectiveBalance.toFixed(6)} ETH`
    );
  }
}

async function createStakeLockTransaction(userId: string, amount: number, matchId: string) {
  return prisma.transaction.create({
    data: {
      userId,
      type: 'STAKE_LOCK',
      amount: new Decimal(amount),
      status: 'CONFIRMED',
      matchId,
      confirmedAt: new Date(),
    },
  });
}

function calculateNewRating(playerRating: number, opponentRating: number, won: boolean): number {
  const expected = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  const actual = won ? 1 : 0;
  return Math.round(playerRating + K_FACTOR * (actual - expected));
}
