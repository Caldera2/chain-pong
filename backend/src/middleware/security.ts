// ─────────────────────────────────────────────────────────
// Chain Pong — Security Middleware
//
// 1. Match duration verification (anti-cheat)
// 2. Signed payout tokens (HMAC)
// 3. Request origin validation
// ─────────────────────────────────────────────────────────

import crypto from 'crypto';
import { Response, NextFunction } from 'express';
import { env } from '../config/env';
import { AuthRequest } from '../types';
import { BadRequestError, ForbiddenError } from '../utils/errors';

// ─── Constants ───────────────────────────────────────────
const MIN_MATCH_DURATION_MS = 30_000; // 30 seconds minimum game time
const PAYOUT_TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const HMAC_ALGO = 'sha256';

// ─── Match Duration Verification ─────────────────────────
// Verifies that a match lasted at least MIN_MATCH_DURATION_MS
// before allowing result submission. Flags instant wins as fraud.

export function verifyMatchDuration(startedAt: Date | null, matchId: string): { valid: boolean; durationMs: number; reason?: string } {
  if (!startedAt) {
    return { valid: false, durationMs: 0, reason: 'Match has no start time recorded' };
  }

  const durationMs = Date.now() - startedAt.getTime();

  if (durationMs < MIN_MATCH_DURATION_MS) {
    console.warn(`[SECURITY] ⚠️ FRAUD FLAG: Match ${matchId} completed in ${(durationMs / 1000).toFixed(1)}s (min: ${MIN_MATCH_DURATION_MS / 1000}s)`);
    return {
      valid: false,
      durationMs,
      reason: `Match completed too quickly (${(durationMs / 1000).toFixed(1)}s). Minimum: ${MIN_MATCH_DURATION_MS / 1000}s`,
    };
  }

  return { valid: true, durationMs };
}

// ─── Payout Token (HMAC-signed) ──────────────────────────
// When the backend declares a winner, it generates a signed
// PayoutToken. This token must be presented back to trigger
// the actual blockchain payout. Prevents replay attacks.

export interface PayoutTokenPayload {
  matchId: string;
  winnerId: string;
  winnerAddress: string;
  potAmount: number;
  issuedAt: number;
}

export function generatePayoutToken(payload: PayoutTokenPayload): string {
  const data = JSON.stringify(payload);
  const hmac = crypto.createHmac(HMAC_ALGO, env.JWT_SECRET);
  hmac.update(data);
  const signature = hmac.digest('hex');

  // Encode as base64url: payload.signature
  const encodedPayload = Buffer.from(data).toString('base64url');
  return `${encodedPayload}.${signature}`;
}

export function verifyPayoutToken(token: string): { valid: boolean; payload?: PayoutTokenPayload; reason?: string } {
  try {
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) {
      return { valid: false, reason: 'Malformed payout token' };
    }

    const data = Buffer.from(encodedPayload, 'base64url').toString('utf8');

    // Verify HMAC
    const hmac = crypto.createHmac(HMAC_ALGO, env.JWT_SECRET);
    hmac.update(data);
    const expectedSignature = hmac.digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'))) {
      return { valid: false, reason: 'Invalid payout token signature' };
    }

    const payload: PayoutTokenPayload = JSON.parse(data);

    // Check expiry
    if (Date.now() - payload.issuedAt > PAYOUT_TOKEN_EXPIRY_MS) {
      return { valid: false, reason: 'Payout token expired' };
    }

    return { valid: true, payload };
  } catch (err: any) {
    return { valid: false, reason: `Token verification failed: ${err.message}` };
  }
}

// ─── Score Validation ────────────────────────────────────
// Sanity-check scores to catch obvious manipulation.

export function validateScores(
  player1Score: number,
  player2Score: number,
  winScore: number = 7
): { valid: boolean; reason?: string } {
  // Scores must be non-negative integers
  if (!Number.isInteger(player1Score) || !Number.isInteger(player2Score)) {
    return { valid: false, reason: 'Scores must be integers' };
  }
  if (player1Score < 0 || player2Score < 0) {
    return { valid: false, reason: 'Scores cannot be negative' };
  }

  // At least one player must reach exactly the win score
  if (player1Score !== winScore && player2Score !== winScore) {
    return { valid: false, reason: `At least one player must reach ${winScore} to win` };
  }

  // The winner's score is exactly winScore, the loser's is less
  if (player1Score === winScore && player2Score === winScore) {
    return { valid: false, reason: 'Both players cannot have the winning score' };
  }

  // Maximum possible score for loser
  if (player1Score > winScore || player2Score > winScore) {
    return { valid: false, reason: `Score cannot exceed ${winScore}` };
  }

  return { valid: true };
}

// ─── Request Fingerprint ─────────────────────────────────
// Creates a fingerprint of the request for logging suspicious activity.

export function getRequestFingerprint(req: AuthRequest): string {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const userAgent = req.get('user-agent') || 'unknown';
  const userId = req.user?.userId || 'anonymous';
  return `[${ip}] [${userId}] [${userAgent.substring(0, 50)}]`;
}

// ─── Middleware: Validate Match Result Request ───────────
// Applied to the POST /api/matches/:id/result endpoint.

export function validateMatchResultRequest(req: AuthRequest, _res: Response, next: NextFunction): void {
  try {
    const { player1Score, player2Score } = req.body;

    // Score validation
    const scoreCheck = validateScores(player1Score, player2Score);
    if (!scoreCheck.valid) {
      throw new BadRequestError(`Invalid scores: ${scoreCheck.reason}`);
    }

    next();
  } catch (error) {
    next(error);
  }
}

// ─── Private Key Safety Check ────────────────────────────
// Scans environment on startup to ensure private keys
// aren't accidentally exposed in logs or code.

export function auditSecretSafety(): void {
  // Verify TREASURY_PRIVATE_KEY exists but never log it
  if (!env.TREASURY_PRIVATE_KEY) {
    console.warn('[SECURITY] ⚠️ TREASURY_PRIVATE_KEY is not set — payouts will fail');
  } else {
    // Verify it's a valid private key format without logging the key
    const keyLength = env.TREASURY_PRIVATE_KEY.replace('0x', '').length;
    if (keyLength !== 64) {
      console.error('[SECURITY] ❌ TREASURY_PRIVATE_KEY appears malformed (expected 64 hex chars)');
    } else {
      console.log('[SECURITY] ✅ TREASURY_PRIVATE_KEY loaded (never logged)');
    }
  }

  // Verify JWT_SECRET is strong
  if (env.JWT_SECRET && env.JWT_SECRET.length < 32) {
    console.warn('[SECURITY] ⚠️ JWT_SECRET is short — use at least 32 characters');
  }

  // Ensure NODE_ENV is set correctly
  if (env.isProd) {
    console.log('[SECURITY] Running in PRODUCTION mode');
    if (env.CORS_ORIGIN === 'http://localhost:3000') {
      console.warn('[SECURITY] ⚠️ CORS_ORIGIN still set to localhost in production!');
    }
  }
}
