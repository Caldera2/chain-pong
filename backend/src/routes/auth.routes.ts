import { Router, Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service';
import { requireAuth } from '../middleware/auth';
import { signupEmailSchema, loginEmailSchema, walletAuthSchema } from '../utils/validators';
import { generateAuthMessage, recoverAndReEncrypt } from '../utils/wallet';
import { prisma } from '../config/database';
import { AuthRequest } from '../types';

const router = Router();

// ─────────────────────────────────────────────────────────
// POST /api/auth/signup — Email signup
// ─────────────────────────────────────────────────────────
router.post('/signup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, username, password } = signupEmailSchema.parse(req.body);
    const result = await authService.signupWithEmail(email, username, password);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/auth/login — Email login
// ─────────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = loginEmailSchema.parse(req.body);
    const result = await authService.loginWithEmail(email, password);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/auth/wallet — Wallet auth (login or signup)
// ─────────────────────────────────────────────────────────
router.post('/wallet', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletAddress, signature, message, username } = walletAuthSchema.parse(req.body);
    const result = await authService.authWithWallet(walletAddress, signature, message, username);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/auth/nonce?address=0x... — Get sign message for wallet auth
// ─────────────────────────────────────────────────────────
router.get('/nonce', (req: Request, res: Response) => {
  const address = req.query.address as string;
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    res.status(400).json({ success: false, error: 'Invalid wallet address' });
    return;
  }

  const nonce = authService.generateNonce();
  const message = generateAuthMessage(address, nonce);
  res.json({ success: true, data: { nonce, message } });
});

// ─────────────────────────────────────────────────────────
// POST /api/auth/forgot-password — Request password reset email
// ─────────────────────────────────────────────────────────
router.post('/forgot-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      res.status(400).json({ success: false, error: 'Email is required' });
      return;
    }
    const result = await authService.requestPasswordReset(email.trim().toLowerCase());
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/auth/reset-password — Reset password with token
// ─────────────────────────────────────────────────────────
router.post('/reset-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      res.status(400).json({ success: false, error: 'Token and new password are required' });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
      return;
    }
    const result = await authService.resetPassword(token, newPassword);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/auth/recover-wallet — Re-encrypt wallet from seed phrase
//
// Used after password reset or if the encryption key rotates.
// User provides their 12-word seed phrase; server verifies it
// matches their existing game wallet address, then re-encrypts
// the private key with the current WALLET_ENCRYPTION_KEY.
// ─────────────────────────────────────────────────────────
router.post('/recover-wallet', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { seedPhrase } = req.body;
    if (!seedPhrase || typeof seedPhrase !== 'string') {
      res.status(400).json({ success: false, error: 'seedPhrase is required' });
      return;
    }

    const words = seedPhrase.trim().split(/\s+/);
    if (words.length !== 12) {
      res.status(400).json({ success: false, error: 'Seed phrase must be exactly 12 words' });
      return;
    }

    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { gameWallet: true },
    });

    if (!user?.gameWallet) {
      res.status(400).json({ success: false, error: 'No game wallet to recover' });
      return;
    }

    // Derive wallet from seed phrase and verify it matches
    const recovered = recoverAndReEncrypt(seedPhrase);
    if (recovered.address.toLowerCase() !== user.gameWallet.toLowerCase()) {
      res.status(403).json({ success: false, error: 'Seed phrase does not match your game wallet' });
      return;
    }

    // Re-encrypt with current server key
    await prisma.user.update({
      where: { id: userId },
      data: { encryptedKey: recovered.encryptedKey },
    });

    res.json({ success: true, data: { message: 'Wallet re-encrypted successfully', address: recovered.address } });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/auth/refresh — Refresh access token
// ─────────────────────────────────────────────────────────
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ success: false, error: 'Refresh token required' });
      return;
    }
    const tokens = await authService.refreshAccessToken(refreshToken);
    res.json({ success: true, data: tokens });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/auth/logout — Revoke all refresh tokens
// ─────────────────────────────────────────────────────────
router.post('/logout', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await authService.logout(req.user!.userId);
    res.json({ success: true, message: 'Logged out' });
  } catch (error) {
    next(error);
  }
});

export default router;
