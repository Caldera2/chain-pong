import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/database';
import { signAccessToken, signRefreshToken, getTokenExpiry } from '../utils/jwt';
import { generateGameWallet, verifySignature } from '../utils/wallet';
import { env } from '../config/env';
import {
  ConflictError,
  UnauthorizedError,
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from '../utils/errors';
import { JwtPayload } from '../types';

const SALT_ROUNDS = 12;

// ─────────────────────────────────────────────────────────
// Email Signup
// ─────────────────────────────────────────────────────────

export async function signupWithEmail(email: string, username: string, password: string) {
  // Check uniqueness
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });

  if (existing) {
    if (existing.email === email) throw new ConflictError('Email already registered');
    throw new ConflictError('Username already taken');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const wallet = generateGameWallet();

  const user = await prisma.user.create({
    data: {
      email,
      username,
      passwordHash,
      authMethod: 'EMAIL',
      gameWallet: wallet.address,
      encryptedKey: wallet.encryptedKey,
      stats: { create: {} }, // create PlayerStats with defaults
      ownedBoards: {
        create: { boardId: 'classic' }, // everyone gets the classic board
      },
    },
    include: { stats: true },
  });

  const tokens = await generateTokens({ userId: user.id, username: user.username, authMethod: 'EMAIL' });

  return {
    user: sanitizeUser(user),
    ...tokens,
    // Return seed phrase ONLY on signup — user must save it immediately
    seedPhrase: wallet.mnemonic,
  };
}

// ─────────────────────────────────────────────────────────
// Email Login
// ─────────────────────────────────────────────────────────

export async function loginWithEmail(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { stats: true },
  });

  if (!user || !user.passwordHash) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (user.isBanned) {
    throw new ForbiddenError('Account has been suspended');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // Migrate old users who don't have a real wallet yet
  let seedPhrase: string | undefined;
  if (!user.encryptedKey) {
    const wallet = generateGameWallet();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        gameWallet: wallet.address,
        encryptedKey: wallet.encryptedKey,
        lastLoginAt: new Date(),
      },
    });
    seedPhrase = wallet.mnemonic;
  } else {
    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
  }

  const tokens = await generateTokens({ userId: user.id, username: user.username, authMethod: 'EMAIL' });

  return {
    user: sanitizeUser(user),
    ...tokens,
    // Return seed phrase if wallet was just migrated — user must save it
    ...(seedPhrase ? { seedPhrase, walletMigrated: true } : {}),
  };
}

// ─────────────────────────────────────────────────────────
// Wallet Auth (signup or login in one flow)
// ─────────────────────────────────────────────────────────

export async function authWithWallet(walletAddress: string, signature: string, message: string, username?: string) {
  // Verify the signature
  const isValid = verifySignature(message, signature, walletAddress);
  if (!isValid) {
    throw new UnauthorizedError('Invalid wallet signature');
  }

  const normalized = walletAddress.toLowerCase();

  // Check if wallet already registered
  let user = await prisma.user.findUnique({
    where: { walletAddress: normalized },
    include: { stats: true },
  });

  if (user) {
    // Login — existing wallet user
    if (user.isBanned) throw new ForbiddenError('Account has been suspended');

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
  } else {
    // Signup — new wallet user
    const displayName = username || `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;

    // Check username uniqueness
    if (username) {
      const nameExists = await prisma.user.findUnique({ where: { username } });
      if (nameExists) throw new ConflictError('Username already taken');
    }

    user = await prisma.user.create({
      data: {
        username: displayName,
        authMethod: 'WALLET',
        walletAddress: normalized,
        stats: { create: {} },
        ownedBoards: { create: { boardId: 'classic' } },
      },
      include: { stats: true },
    });
  }

  const tokens = await generateTokens({ userId: user.id, username: user.username, authMethod: 'WALLET' });

  return {
    user: sanitizeUser(user),
    ...tokens,
  };
}

// ─────────────────────────────────────────────────────────
// Token Refresh
// ─────────────────────────────────────────────────────────

export async function refreshAccessToken(refreshToken: string) {
  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: true },
  });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  if (stored.user.isBanned) {
    throw new ForbiddenError('Account has been suspended');
  }

  // Rotate: revoke old, issue new
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const tokens = await generateTokens({
    userId: stored.user.id,
    username: stored.user.username,
    authMethod: stored.user.authMethod,
  });

  return tokens;
}

// ─────────────────────────────────────────────────────────
// Logout (revoke all refresh tokens)
// ─────────────────────────────────────────────────────────

export async function logout(userId: string) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// ─────────────────────────────────────────────────────────
// Forgot Password — Generate reset token and send email
// ─────────────────────────────────────────────────────────

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  // Always return success to prevent email enumeration
  if (!user || user.authMethod !== 'EMAIL') {
    return { message: 'If an account exists, a reset link has been sent.' };
  }

  // Invalidate any existing tokens
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  // Create new token (expires in 1 hour)
  const token = uuidv4();
  await prisma.passwordResetToken.create({
    data: {
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    },
  });

  // Send email
  const { sendPasswordResetEmail } = await import('./email.service');
  await sendPasswordResetEmail(email, token, user.username);

  return { message: 'If an account exists, a reset link has been sent.' };
}

// ─────────────────────────────────────────────────────────
// Reset Password — Verify token and update password
// ─────────────────────────────────────────────────────────

export async function resetPassword(token: string, newPassword: string) {
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!resetToken) {
    throw new BadRequestError('Invalid or expired reset link');
  }

  if (resetToken.usedAt) {
    throw new BadRequestError('This reset link has already been used');
  }

  if (resetToken.expiresAt < new Date()) {
    throw new BadRequestError('This reset link has expired');
  }

  // Hash new password and update
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.user.update({
    where: { id: resetToken.userId },
    data: { passwordHash },
  });

  // Mark token as used
  await prisma.passwordResetToken.update({
    where: { id: resetToken.id },
    data: { usedAt: new Date() },
  });

  // Revoke all refresh tokens (force re-login)
  await prisma.refreshToken.updateMany({
    where: { userId: resetToken.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return { message: 'Password reset successfully. Please log in with your new password.' };
}

// ─────────────────────────────────────────────────────────
// Get auth nonce for wallet login
// ─────────────────────────────────────────────────────────

export function generateNonce(): string {
  return uuidv4();
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

async function generateTokens(payload: JwtPayload) {
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  // Store refresh token in DB
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: payload.userId,
      expiresAt: getTokenExpiry(env.JWT_REFRESH_EXPIRES_IN),
    },
  });

  return { accessToken, refreshToken };
}

function sanitizeUser(user: {
  id: string;
  email: string | null;
  username: string;
  authMethod: string;
  walletAddress: string | null;
  gameWallet: string | null;
  avatar: string;
  createdAt: Date;
  stats: { wins: number; losses: number; gamesPlayed: number; totalEarnings: any; totalLost: any; rating: number; winStreak: number; bestStreak: number } | null;
}) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    authMethod: user.authMethod,
    walletAddress: user.walletAddress,
    gameWallet: user.gameWallet,
    avatar: user.avatar,
    createdAt: user.createdAt.toISOString(),
    stats: user.stats ? {
      wins: user.stats.wins,
      losses: user.stats.losses,
      gamesPlayed: user.stats.gamesPlayed,
      totalEarnings: user.stats.totalEarnings.toString(),
      totalLost: user.stats.totalLost.toString(),
      rating: user.stats.rating,
      winStreak: user.stats.winStreak,
      bestStreak: user.stats.bestStreak,
    } : null,
  };
}
