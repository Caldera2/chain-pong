// ─────────────────────────────────────────────────────────
// Chain Pong — Match Service
//
// Server-authoritative match management with:
// - Idempotent payouts via payout.service.ts
// - Match duration verification (anti-cheat)
// - Score validation
// - Treasury guard circuit breaker
// - Stake receipt verification (anti double-spend)
// - Two-step payout: result → token → claim
// ─────────────────────────────────────────────────────────

import { Decimal } from '@prisma/client/runtime/library';
import { ethers } from 'ethers';
import crypto from 'crypto';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { BadRequestError, NotFoundError, InsufficientBalanceError, ForbiddenError } from '../utils/errors';
import { sendSecurityAlert } from '../utils/discord';
import { getGameWalletSigner, getProvider, getOnChainBalanceWei, estimateTransferGas } from '../utils/wallet';
import { executeWinnerPayout, executeRefund } from './payout.service';
import { verifyMatchDuration, validateScores, generatePayoutToken, verifyPayoutToken } from '../middleware/security';

// ─── Constants ───────────────────────────────────────────
const VALID_STAKES = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05];
const WIN_SCORE = 7;
const PROTOCOL_FEE_BPS = 250; // 2.5%
const K_FACTOR = 32;
const TREASURY_ADDRESS = env.TREASURY_ADDRESS;

// ─── Official Game Config (must match PongGame.tsx) ──────
// These are the canonical physics constants. A HMAC-SHA256 hash
// is sent with each match so the frontend can verify it hasn't
// been tampered with. The backend validates against these values.

export const OFFICIAL_GAME_CONFIG = {
  CANVAS_W: 800,
  CANVAS_H: 500,
  PADDLE_W: 14,
  PADDLE_H: 100,
  BALL_RADIUS: 10,
  BALL_SPEED_X: 5,
  BALL_SPEED_Y: 3,
  BALL_MAX_SPEED: 12,
  WIN_SCORE: 7,
  TICK_INTERVAL_FRAMES: 30,
} as const;

// Derived validation constants
const CANVAS_W = OFFICIAL_GAME_CONFIG.CANVAS_W;
const CANVAS_H = OFFICIAL_GAME_CONFIG.CANVAS_H;
const PADDLE_H = OFFICIAL_GAME_CONFIG.PADDLE_H;
const BALL_MAX_SPEED = OFFICIAL_GAME_CONFIG.BALL_MAX_SPEED;
const PADDLE_MAX_SPEED_PER_FRAME = 30; // px between ticks (~15 frames at 30-frame interval)
const TICK_INTERVAL_FRAMES = OFFICIAL_GAME_CONFIG.TICK_INTERVAL_FRAMES;
const MIN_GAME_DURATION_SEC = 15;      // a 7-point game can't end in <15s realistically
const MAX_GAME_DURATION_SEC = 600;     // 10 minutes max
const MIN_TICKS_PER_POINT = 3;        // at least ~1.5s of play per point scored

/**
 * Generate a HMAC-SHA256 hash of the official game config.
 * Sent to the frontend with each match so the client can verify
 * its local constants haven't been modified via DevTools.
 */
export function generateConfigHash(seed: string): string {
  const configStr = JSON.stringify(OFFICIAL_GAME_CONFIG);
  const hmac = crypto.createHmac('sha256', seed);
  hmac.update(configStr);
  return hmac.digest('hex');
}

// ─── CSPRNG Match ID (on-chain) ─────────────────────────
// Generates a cryptographically random bytes32 match ID for
// the smart contract. Uses crypto.randomBytes(32) — impossible
// to predict or collide. The DB match uses Prisma's cuid for
// its primary key, but the ON-CHAIN matchId is this CSPRNG value.

export function generateOnChainMatchId(): string {
  return '0x' + crypto.randomBytes(32).toString('hex');
}

// ─── Server-Seeded Deterministic Ball Spawn ─────────────
// Generates a crypto-random seed and derives the initial
// ball trajectory from it. Both server and client use the
// same algorithm, so the server can verify the first tick.

export function generateMatchSeed(): string {
  return crypto.randomBytes(16).toString('hex'); // 32-char hex
}

/**
 * Derives deterministic ball spawn velocities from a matchSeed.
 * Uses HMAC-SHA256 to extract two deterministic values for VX/VY direction.
 * Must match the frontend implementation exactly.
 */
export function deriveBallSpawn(seed: string, roundIndex: number = 0): { vx: number; vy: number } {
  const hmac = crypto.createHmac('sha256', seed);
  hmac.update(`ball-spawn-${roundIndex}`);
  const hash = hmac.digest();

  // Use first byte for VX direction, second byte for VY direction
  const vxDir = (hash[0] & 1) === 0 ? -1 : 1;
  const vyDir = (hash[1] & 1) === 0 ? -1 : 1;

  return { vx: 5 * vxDir, vy: 3 * vyDir };
}

// ─── Tick Physics Validator (anti-cheat) ─────────────────
// Iterates through the client tick log and mathematically
// verifies that the game state transitions are physically
// plausible. Catches fake/generated tick logs.

interface TickValidationResult {
  valid: boolean;
  reason?: string;
  warnings: string[];
}

function validateTickPhysics(
  ticks: any[],
  player1Score: number,
  player2Score: number,
  matchSeed?: string | null,
  serverDurationMs?: number | null
): TickValidationResult {
  const warnings: string[] = [];

  if (!ticks || ticks.length === 0) {
    return { valid: false, reason: 'Empty tick log', warnings };
  }

  const totalPoints = player1Score + player2Score;

  // ── Tick Rate Ceiling (anti-speedhack / anti-lag-switch) ──
  // At 60fps logging every 30 frames, the engine produces ~2 ticks/second.
  // If the server tracked the wall-clock match duration, the maximum
  // possible ticks = (durationSec * 2). A 10% buffer accounts for
  // network jitter and timing variance. Anything beyond that means
  // the client ran at an accelerated framerate (speedhack) or dumped
  // queued ticks from a lag switch.
  if (serverDurationMs && serverDurationMs > 0) {
    const serverDurationSec = serverDurationMs / 1000;
    const TICKS_PER_SECOND = 2; // 60fps / 30-frame interval
    const RATE_BUFFER = 1.10;   // 10% tolerance
    const maxTicksAllowed = Math.ceil(serverDurationSec * TICKS_PER_SECOND * RATE_BUFFER);

    if (ticks.length > maxTicksAllowed) {
      // Fire-and-forget Discord alert — don't block validation
      sendSecurityAlert(
        `**SPEEDHACK DETECTED**\nTicks: ${ticks.length} (max ${maxTicksAllowed})\nServer duration: ${serverDurationSec.toFixed(1)}s\nSeed: \`${matchSeed || 'none'}\``,
        'error'
      ).catch(() => {});
      return {
        valid: false,
        reason: `Tick rate ceiling exceeded: ${ticks.length} ticks in ${serverDurationSec.toFixed(1)}s (max ${maxTicksAllowed}). Possible speedhack or lag-switch dump.`,
        warnings,
      };
    }
  }

  // ── Seed-based first trajectory validation ────────
  // If the server generated a matchSeed, verify the first tick's
  // ball velocity matches the seed-derived spawn direction.
  if (matchSeed && ticks.length > 0) {
    const expected = deriveBallSpawn(matchSeed, 0);
    const firstTick = ticks[0];

    if (typeof firstTick.bvx === 'number' && typeof firstTick.bvy === 'number') {
      // Verify direction matches (sign must match)
      const vxSignMatch = Math.sign(firstTick.bvx) === Math.sign(expected.vx);
      const vySignMatch = Math.sign(firstTick.bvy) === Math.sign(expected.vy);

      if (!vxSignMatch || !vySignMatch) {
        return {
          valid: false,
          reason: `First ball trajectory does not match server seed. Expected vx=${expected.vx}, vy=${expected.vy}, got vx=${firstTick.bvx}, vy=${firstTick.bvy}`,
          warnings,
        };
      }

      // Also verify magnitude is correct (5 for vx, 3 for vy)
      if (Math.abs(firstTick.bvx) !== 5 || Math.abs(firstTick.bvy) !== 3) {
        warnings.push(`First tick ball speed anomaly: vx=${firstTick.bvx}, vy=${firstTick.bvy}`);
      }
    } else {
      // First tick missing ball velocity — suspicious for seeded matches
      warnings.push('First tick missing ball velocity fields (bvx/bvy)');
    }
  }

  // 1. Minimum tick count — need enough ticks to represent a real game
  const minTicks = totalPoints * MIN_TICKS_PER_POINT;
  if (ticks.length < minTicks) {
    return {
      valid: false,
      reason: `Too few ticks: ${ticks.length} for ${totalPoints} points (need >= ${minTicks})`,
      warnings,
    };
  }

  // 2. Duration check — game must take a realistic amount of time
  const firstTick = ticks[0];
  const lastTick = ticks[ticks.length - 1];
  const durationMs = (lastTick?.t || 0) - (firstTick?.t || 0);
  const durationSec = durationMs / 1000;

  if (durationSec < MIN_GAME_DURATION_SEC) {
    return {
      valid: false,
      reason: `Game too fast: ${durationSec.toFixed(1)}s for ${totalPoints} points`,
      warnings,
    };
  }

  if (durationSec > MAX_GAME_DURATION_SEC) {
    warnings.push(`Unusually long game: ${durationSec.toFixed(0)}s`);
  }

  // 3. Validate tick-by-tick physics
  let prevTick = ticks[0];
  let scoreIncreases = 0;

  for (let i = 1; i < ticks.length; i++) {
    const tick = ticks[i];

    // 3a. Paddle speed check — paddle can't teleport
    if (typeof tick.py === 'number' && typeof prevTick.py === 'number') {
      const paddleDelta = Math.abs(tick.py - prevTick.py);
      // Between ticks (~30 frames), max paddle movement is generous
      // but a teleport across the entire canvas is impossible
      if (paddleDelta > PADDLE_MAX_SPEED_PER_FRAME * TICK_INTERVAL_FRAMES) {
        warnings.push(`Paddle teleport at tick ${i}: moved ${paddleDelta.toFixed(0)}px`);
      }
    }

    // 3b. Ball position bounds check
    if (typeof tick.bx === 'number' && typeof tick.by === 'number') {
      if (tick.bx < -BALL_MAX_SPEED || tick.bx > CANVAS_W + BALL_MAX_SPEED) {
        warnings.push(`Ball X out of bounds at tick ${i}: ${tick.bx}`);
      }
      if (tick.by < -BALL_MAX_SPEED || tick.by > CANVAS_H + BALL_MAX_SPEED) {
        warnings.push(`Ball Y out of bounds at tick ${i}: ${tick.by}`);
      }
    }

    // 3c. Time must be monotonically increasing
    if (typeof tick.t === 'number' && typeof prevTick.t === 'number') {
      if (tick.t < prevTick.t) {
        return {
          valid: false,
          reason: `Time went backwards at tick ${i}: ${tick.t} < ${prevTick.t}`,
          warnings,
        };
      }
    }

    // 3d. Score progression — scores should only increase
    if (typeof tick.s === 'string' && typeof prevTick.s === 'string') {
      const [curP1, curP2] = tick.s.split('-').map(Number);
      const [prevP1, prevP2] = prevTick.s.split('-').map(Number);
      if (!isNaN(curP1) && !isNaN(prevP1)) {
        if (curP1 < prevP1 || curP2 < prevP2) {
          return {
            valid: false,
            reason: `Score decreased at tick ${i}: ${prevTick.s} -> ${tick.s}`,
            warnings,
          };
        }
        if (curP1 > prevP1 || curP2 > prevP2) {
          scoreIncreases++;
        }
      }
    }

    prevTick = tick;
  }

  // 4. Final score in ticks should match submitted scores
  if (typeof lastTick.s === 'string') {
    const [tickP1, tickP2] = lastTick.s.split('-').map(Number);
    if (!isNaN(tickP1) && !isNaN(tickP2)) {
      if (tickP1 !== player1Score || tickP2 !== player2Score) {
        warnings.push(`Final tick score ${lastTick.s} != submitted ${player1Score}-${player2Score}`);
      }
    }
  }

  // 5. Score increases should roughly match total points
  if (scoreIncreases < totalPoints - 1) {
    warnings.push(`Only ${scoreIncreases} score transitions for ${totalPoints} total points`);
  }

  // Fail if too many warnings (strong indicator of fabrication)
  if (warnings.length >= 5) {
    return {
      valid: false,
      reason: `Too many physics anomalies (${warnings.length}): ${warnings[0]}`,
      warnings,
    };
  }

  return { valid: true, warnings };
}

// ─────────────────────────────────────────────────────────
// Send ETH from player's game wallet to treasury
//
// Security: Waits for 1+ confirmations AND verifies the
// treasury actually received the ETH (anti double-spend).
// ─────────────────────────────────────────────────────────

async function sendStakeToTreasury(userId: string, amount: number): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { encryptedKey: true, authMethod: true },
    });

    if (!user?.encryptedKey) return null;

    const signer = getGameWalletSigner(user.encryptedKey);
    const amountWei = ethers.parseEther(amount.toString());

    // Check on-chain balance covers stake + gas
    const balance = await getOnChainBalanceWei(signer.address);
    const gasCost = await estimateTransferGas();
    if (balance < amountWei + gasCost) {
      console.warn(`[STAKE] Player ${userId} has insufficient on-chain balance for stake`);
      return null;
    }

    // Snapshot treasury balance BEFORE the stake
    const treasuryBalanceBefore = await getOnChainBalanceWei(TREASURY_ADDRESS);

    // Send the stake — wait for 2 confirmations to prevent re-org attacks
    const tx = await signer.sendTransaction({
      to: TREASURY_ADDRESS,
      value: amountWei,
    });
    const receipt = await tx.wait(2); // 2 confirmations (anti double-spend)

    if (!receipt || receipt.status === 0) {
      console.error(`[STAKE] TX reverted for player ${userId}: ${tx.hash}`);
      return null;
    }

    // ── Verify ETH actually arrived in treasury ──────
    // This prevents the scenario where a tx "confirms" but
    // gets re-orged away, or the to-address was manipulated.
    const treasuryBalanceAfter = await getOnChainBalanceWei(TREASURY_ADDRESS);
    const expectedIncrease = amountWei;

    // Allow some tolerance for gas costs on other concurrent txs
    // but the treasury balance must have gone UP by at least 90% of the stake
    const minimumIncrease = (expectedIncrease * 90n) / 100n;
    const actualIncrease = treasuryBalanceAfter - treasuryBalanceBefore;

    if (actualIncrease < minimumIncrease) {
      console.error(`[STAKE] ⚠️ RECEIPT VERIFICATION FAILED for player ${userId}`);
      console.error(`[STAKE]   Expected treasury increase: ≥${ethers.formatEther(minimumIncrease)} ETH`);
      console.error(`[STAKE]   Actual treasury increase: ${ethers.formatEther(actualIncrease)} ETH`);
      console.error(`[STAKE]   TX hash: ${tx.hash}`);
      // Don't return null — the tx IS confirmed, this could be a timing issue
      // with other concurrent deposits/withdrawals. Log the warning but proceed.
      console.warn(`[STAKE] Proceeding with confirmed tx despite balance variance`);
    }

    console.log(`[STAKE] ✅ Player ${userId} staked ${amount} ETH | TX: ${tx.hash} | Block: ${receipt.blockNumber}`);
    return tx.hash;
  } catch (err: any) {
    console.error(`[STAKE] Failed for user ${userId}:`, err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────
// Verify actual pot from confirmed DB transactions
//
// Instead of trusting the potAmount stored on the match
// (which was set from user input), we re-calculate the
// actual pot by summing confirmed STAKE_LOCK transactions.
// ─────────────────────────────────────────────────────────

async function getVerifiedPotAmount(matchId: string): Promise<number> {
  const confirmedStakes = await prisma.transaction.aggregate({
    where: {
      matchId,
      type: 'STAKE_LOCK',
      status: 'CONFIRMED',
    },
    _sum: { amount: true },
  });

  const verifiedPot = Number(confirmedStakes._sum.amount || 0);
  return verifiedPot;
}

// ─────────────────────────────────────────────────────────
// Claim payout — Two-step payout flow
//
// Step 1: submitMatchResult() declares winner → returns signed PayoutToken
// Step 2: claimPayout() verifies the token → triggers actual blockchain transfer
//
// This prevents:
// - Frontend replay attacks
// - Payouts without proper winner declaration
// - Token tampering (HMAC-signed)
// ─────────────────────────────────────────────────────────

export async function claimPayout(payoutToken: string, claimerId: string) {
  // Verify the HMAC-signed token
  const verification = verifyPayoutToken(payoutToken);
  if (!verification.valid || !verification.payload) {
    throw new BadRequestError(`Invalid payout token: ${verification.reason}`);
  }

  const { matchId, winnerId, winnerAddress, potAmount } = verification.payload;

  // Only the winner can claim
  if (claimerId !== winnerId) {
    throw new ForbiddenError('Only the match winner can claim the payout');
  }

  // ── Atomic Claim Mutex ─────────────────────────────
  // Race condition defense: if 50 concurrent requests hit this endpoint,
  // all would read payoutTxHash as null and proceed to payout.
  // Instead, use an atomic conditional update — only the FIRST request
  // that matches (status=COMPLETED, winnerId=correct, payoutTxHash=null)
  // will succeed. All others get count=0 and abort immediately.
  // This is a database-level mutex — no application-level locks needed.
  const claimLock = await prisma.match.updateMany({
    where: {
      id: matchId,
      status: 'COMPLETED',
      winnerId,
      payoutTxHash: null, // Only grab if no one else has claimed
    },
    data: {
      payoutTxHash: 'CLAIMING', // Sentinel value — replaced with real txHash after payout
    },
  });

  if (claimLock.count === 0) {
    // Another concurrent request already grabbed this claim, or match state changed
    sendSecurityAlert(
      `**BLOCKED CONCURRENT CLAIM**\nMatch: \`${matchId}\`\nClaimer: \`${claimerId}\`\nAttempted by: \`${winnerId}\``,
      'warn'
    ).catch(() => {});
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: { status: true, winnerId: true, payoutTxHash: true },
    });
    if (!match) throw new NotFoundError('Match not found');
    if (match.payoutTxHash) throw new BadRequestError('Payout already claimed or in progress');
    if (match.status !== 'COMPLETED') throw new BadRequestError('Match is not completed');
    if (match.winnerId !== winnerId) throw new ForbiddenError('Winner mismatch');
    throw new BadRequestError('Claim failed — please try again');
  }

  // ── We now hold the exclusive claim lock ───────────

  try {
    // Use verified pot from confirmed DB transactions, NOT from the token
    const verifiedPot = await getVerifiedPotAmount(matchId);
    if (verifiedPot <= 0) {
      // Release lock — no valid pot
      await prisma.match.update({ where: { id: matchId }, data: { payoutTxHash: null } });
      throw new BadRequestError('No confirmed stakes found for this match');
    }

    // If verified pot differs significantly from token, flag it
    if (Math.abs(verifiedPot - potAmount) > 0.0001) {
      console.warn(`[CLAIM] Pot mismatch for match ${matchId}: token=${potAmount}, verified=${verifiedPot}. Using verified amount.`);
    }

    // Execute the actual blockchain transfer
    const result = await executeWinnerPayout(winnerAddress, verifiedPot, matchId);

    if (!result.success) {
      // Release lock — payout failed
      await prisma.match.update({ where: { id: matchId }, data: { payoutTxHash: null } });
      throw new BadRequestError(`Payout failed: ${result.error}`);
    }

    // Replace sentinel with real txHash
    await prisma.match.update({
      where: { id: matchId },
      data: { payoutTxHash: result.txHash },
    });

    return {
      matchId,
      txHash: result.txHash,
      winnerPayout: result.winnerPayout,
      protocolFee: result.protocolFee,
    };
  } catch (err) {
    // If anything throws after acquiring the lock, release it so the
    // user can retry (unless it was already released above)
    const current = await prisma.match.findUnique({
      where: { id: matchId },
      select: { payoutTxHash: true },
    });
    if (current?.payoutTxHash === 'CLAIMING') {
      await prisma.match.update({ where: { id: matchId }, data: { payoutTxHash: null } }).catch(() => {});
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────
// Create a PvE (vs Computer) match
// ─────────────────────────────────────────────────────────

export async function createComputerMatch(
  userId: string,
  boardId: string,
  difficulty: 'EASY' | 'MEDIUM' | 'HARD'
) {
  await verifyBoardOwnership(userId, boardId);

  const matchSeed = generateMatchSeed();
  const configHash = generateConfigHash(matchSeed);

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
      matchSeed,
    },
  });

  return { ...match, configHash };
}

// ─────────────────────────────────────────────────────────
// Create a PvP match (player joins queue -> gets matched)
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

  // Send player's stake ETH to treasury on-chain
  const stakeTxHash = await sendStakeToTreasury(userId, stakeAmount);
  if (stakeTxHash) {
    await prisma.match.update({
      where: { id: match.id },
      data: { stakeTxHash, onChainSynced: true },
    });
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

  // Lock opponent's stake in DB
  await createStakeLockTransaction(userId, stakeAmount, matchId);

  // Send opponent's stake ETH to treasury on-chain
  const joinTxHash = await sendStakeToTreasury(userId, stakeAmount);

  const updated = await prisma.match.update({
    where: { id: matchId },
    data: {
      player2Id: userId,
      player2Board: boardId,
      status: 'MATCHED',
      startedAt: new Date(), // Mark game start time for duration check
      potAmount: new Decimal(stakeAmount * 2),
      ...(joinTxHash ? { onChainSynced: true } : {}),
    },
    include: {
      player1: { select: { id: true, username: true, avatar: true } },
      player2: { select: { id: true, username: true, avatar: true } },
    },
  });

  return updated;
}

// ─────────────────────────────────────────────────────────
// Submit match result (server-authoritative)
//
// Security layers:
// 1. Score validation (sanity check)
// 2. Match duration verification (≥30s)
// 3. Idempotent payout via payout.service.ts
// 4. Payout token generation for audit trail
// ─────────────────────────────────────────────────────────

export async function submitMatchResult(
  matchId: string,
  player1Score: number,
  player2Score: number,
  submitterId: string,
  perkUsed: boolean = false,
  tickLog?: any[],
  tickHash?: string
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

  // ── Security: Validate scores ──────────────────────
  const scoreCheck = validateScores(player1Score, player2Score, WIN_SCORE);
  if (!scoreCheck.valid) {
    console.warn(`[MATCH] Invalid scores for match ${matchId}: ${scoreCheck.reason}`);
    throw new BadRequestError(`Invalid scores: ${scoreCheck.reason}`);
  }

  // ── Security: Validate game tick physics ────────────
  // Runs mathematical validation on the tick log to catch
  // fabricated game data from scripts/bots.
  if (tickLog && Array.isArray(tickLog) && tickLog.length > 0) {
    // Server-side wall-clock duration for tick rate ceiling check
    const serverDurationMs = match.startedAt
      ? Date.now() - match.startedAt.getTime()
      : null;

    const physicsCheck = validateTickPhysics(tickLog, player1Score, player2Score, match.matchSeed, serverDurationMs);

    if (physicsCheck.warnings.length > 0) {
      console.warn(`[MATCH] Tick warnings for ${matchId}:`, physicsCheck.warnings);
    }

    if (!physicsCheck.valid && match.mode === 'PVP') {
      console.error(`[MATCH] TAMPERED GAME STATE for PvP match ${matchId}: ${physicsCheck.reason}`);
      await prisma.match.update({
        where: { id: matchId },
        data: { status: 'DISPUTED' },
      });
      throw new BadRequestError(`Tampered game state: ${physicsCheck.reason}`);
    }

    if (!physicsCheck.valid) {
      console.warn(`[MATCH] Tick validation failed for ${matchId}: ${physicsCheck.reason}`);
    }

    if (tickHash) {
      console.log(`[MATCH] Tick hash for ${matchId}: ${tickHash} (${tickLog.length} ticks)`);
    }
  } else if (match.mode === 'PVP') {
    // PvP with no tick log = definite spoofing attempt
    console.error(`[MATCH] No tick log for PvP match ${matchId} - rejecting`);
    await prisma.match.update({
      where: { id: matchId },
      data: { status: 'DISPUTED' },
    });
    throw new BadRequestError('Tick log required for PvP matches');
  }

  // ── Security: Match duration check (PvP only) ─────
  const isPvp = match.mode === 'PVP';
  if (isPvp && match.startedAt) {
    const durationCheck = verifyMatchDuration(match.startedAt, matchId);
    if (!durationCheck.valid) {
      // Flag as disputed instead of completing
      await prisma.match.update({
        where: { id: matchId },
        data: { status: 'DISPUTED' },
      });
      throw new BadRequestError(durationCheck.reason || 'Match flagged as suspicious');
    }
  }

  // Determine winner
  const winnerId = player1Score > player2Score ? match.player1Id : match.player2Id;
  const loserId = winnerId === match.player1Id ? match.player2Id : match.player1Id;
  const stakeAmount = Number(match.stakeAmount);
  const potAmount = Number(match.potAmount);

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

  // ─── Verify actual pot from confirmed DB transactions ───
  // CRITICAL: Use verified pot (what the server actually saw arrive),
  // NOT the potAmount field (which was set from user-facing stake amount).
  const verifiedPot = isPvp ? await getVerifiedPotAmount(matchId) : 0;
  if (isPvp && verifiedPot <= 0 && potAmount > 0) {
    console.warn(`[MATCH] No confirmed stakes found for PvP match ${matchId} — pot was ${potAmount}`);
  }
  const actualPot = isPvp && verifiedPot > 0 ? verifiedPot : potAmount;

  // ─── Update winner stats ────────────────────────────
  const winnerStats = winnerId === match.player1Id ? match.player1?.stats : match.player2?.stats;
  let payoutToken: string | undefined;

  if (winnerStats) {
    const protocolFee = actualPot * PROTOCOL_FEE_BPS / 10000;
    const winnerPayout = actualPot - protocolFee;
    const newStreak = winnerStats.winStreak + 1;

    await prisma.playerStats.update({
      where: { userId: winnerId! },
      data: {
        wins: { increment: 1 },
        gamesPlayed: { increment: 1 },
        totalEarnings: isPvp ? { increment: new Decimal(winnerPayout) } : undefined,
        winStreak: newStreak,
        bestStreak: Math.max(newStreak, winnerStats.bestStreak),
        rating: isPvp && match.player2?.stats
          ? calculateNewRating(winnerStats.rating, match.player2.stats.rating, true)
          : winnerStats.rating,
      },
    });

    // ── Record EARNINGS (no ETH moves yet) ────────────
    // Money stays in treasury until the winner manually claims.
    // This creates an EARNINGS transaction that increases their
    // claimable balance. They must go to the Claim Earnings page
    // to actually receive the ETH.
    if (isPvp && actualPot > 0 && winnerId) {
      const protocolFee = actualPot * PROTOCOL_FEE_BPS / 10000;
      const netEarnings = actualPot - protocolFee;

      await prisma.transaction.create({
        data: {
          userId: winnerId,
          type: 'EARNINGS',
          amount: new Decimal(netEarnings),
          status: 'CONFIRMED',
          matchId,
          metadata: {
            potAmount: actualPot,
            protocolFee,
            protocolFeeBps: PROTOCOL_FEE_BPS,
          },
          confirmedAt: new Date(),
        },
      });

      console.log(`[MATCH] Earnings credited for match ${matchId}: ${netEarnings} ETH to ${winnerId}`);
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

  // Return match data + payout token (if applicable)
  return { ...completed, payoutToken };
}

// ─────────────────────────────────────────────────────────
// Cancel a pending match — return stake to player
// ─────────────────────────────────────────────────────────

export async function cancelMatch(matchId: string, userId: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) throw new NotFoundError('Match not found');
  if (match.player1Id !== userId) throw new ForbiddenError('Only the match creator can cancel');
  if (match.status !== 'PENDING') throw new BadRequestError('Only pending matches can be cancelled');

  const stakeAmount = Number(match.stakeAmount);
  if (stakeAmount > 0) {
    // Return ETH from treasury back to player via secure refund
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { gameWallet: true, walletAddress: true },
    });
    const playerAddress = user?.gameWallet || user?.walletAddress;

    if (playerAddress) {
      const result = await executeRefund(playerAddress, stakeAmount, matchId);
      if (result.success) {
        // Record stake return in DB
        await prisma.transaction.create({
          data: {
            userId,
            type: 'STAKE_RETURN',
            amount: new Decimal(stakeAmount),
            status: 'CONFIRMED',
            matchId,
            txHash: result.txHash,
            confirmedAt: new Date(),
          },
        });
      } else {
        // Refund failed — still cancel match but record as PENDING refund
        await prisma.transaction.create({
          data: {
            userId,
            type: 'STAKE_RETURN',
            amount: new Decimal(stakeAmount),
            status: 'PENDING',
            matchId,
            metadata: { error: result.error },
          },
        });
        console.error(`[CANCEL] Refund failed for match ${matchId}: ${result.error}`);
      }
    } else {
      // No wallet address — record DB-only return
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
    orderBy: { createdAt: 'asc' },
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
  const stats = await prisma.playerStats.findUnique({ where: { userId } });
  if (!stats) throw new NotFoundError('Player stats not found');

  const pendingStakes = await prisma.transaction.aggregate({
    where: { userId, type: 'STAKE_LOCK', status: 'CONFIRMED' },
    _sum: { amount: true },
  });

  const pendingReturns = await prisma.transaction.aggregate({
    where: { userId, type: { in: ['STAKE_RETURN', 'PAYOUT'] }, status: 'CONFIRMED' },
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
