import { z } from 'zod';

// ─── Auth Validators ─────────────────────────────────

export const signupEmailSchema = z.object({
  email: z.string().email('Invalid email address'),
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens, and underscores'),
  password: z.string()
    .min(6, 'Password must be at least 6 characters')
    .max(128, 'Password too long'),
});

export const loginEmailSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const walletAuthSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address'),
  signature: z.string().min(1, 'Signature is required'),
  message: z.string().min(1, 'Message is required'),
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid username format')
    .optional(),
});

// ─── Game Validators ─────────────────────────────────

const VALID_STAKES = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05];

export const createMatchSchema = z.object({
  mode: z.enum(['PVP', 'COMPUTER']),
  stakeAmount: z.number().refine(
    (val) => val === 0 || VALID_STAKES.includes(val),
    'Invalid stake amount'
  ).optional().default(0),
  boardId: z.string().min(1),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
});

export const submitResultSchema = z.object({
  matchId: z.string().uuid(),
  player1Score: z.number().int().min(0).max(11),
  player2Score: z.number().int().min(0).max(11),
  perkUsed: z.boolean().optional().default(false),
});

// ─── Board Validators ────────────────────────────────

export const purchaseBoardSchema = z.object({
  boardId: z.string().min(1),
  txHash: z.string().optional(),
});

// ─── Leaderboard Validators ──────────────────────────

export const leaderboardQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sortBy: z.enum(['wins', 'earnings', 'rating']).default('wins'),
});

// ─── Profile Update ──────────────────────────────────

export const updateProfileSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid username format')
    .optional(),
  avatar: z.string().max(10).optional(),
});

// ─── Withdrawal ──────────────────────────────────────

export const withdrawSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  toAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address'),
});
