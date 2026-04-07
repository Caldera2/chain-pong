import { Router, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import * as playerService from '../services/player.service';
import { syncDeposits, executeWithdrawal, getFullBalance } from '../services/blockchain.service';
import { updateProfileSchema, purchaseBoardSchema, withdrawSchema, updateSocialsSchema } from '../utils/validators';
import { AuthRequest } from '../types';

const router = Router();

// ─────────────────────────────────────────────────────────
// GET /api/player/profile — Get own profile
// ─────────────────────────────────────────────────────────
router.get('/profile', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const profile = await playerService.getProfile(req.user!.userId);
    res.json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// PATCH /api/player/profile — Update profile
// ─────────────────────────────────────────────────────────
router.patch('/profile', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const updates = updateProfileSchema.parse(req.body);
    const result = await playerService.updateProfile(req.user!.userId, updates);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// PATCH /api/player/socials — Update social links
// ─────────────────────────────────────────────────────────
router.patch('/socials', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const updates = updateSocialsSchema.parse(req.body);
    const { prisma } = await import('../config/database');
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        xHandle: updates.xHandle !== undefined ? updates.xHandle : undefined,
        farcasterName: updates.farcasterName !== undefined ? updates.farcasterName : undefined,
        telegramUser: updates.telegramUser !== undefined ? updates.telegramUser : undefined,
      },
      select: { xHandle: true, farcasterName: true, telegramUser: true },
    });
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/player/socials — Get current social links
// ─────────────────────────────────────────────────────────
router.get('/socials', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { prisma } = await import('../config/database');
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { xHandle: true, farcasterName: true, telegramUser: true },
    });
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/player/balance — Get current balance
// ─────────────────────────────────────────────────────────
router.get('/balance', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const balance = await playerService.calculateBalance(req.user!.userId);
    res.json({ success: true, data: { balance: balance.toFixed(8) } });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/player/boards — Get owned boards
// ─────────────────────────────────────────────────────────
router.get('/boards', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const boards = await playerService.getOwnedBoards(req.user!.userId);
    res.json({
      success: true,
      data: boards.map((ub) => ({
        id: ub.board.id,
        name: ub.board.name,
        color: ub.board.color,
        perk: ub.board.perk,
        perkIcon: ub.board.perkIcon,
        rarity: ub.board.rarity,
        price: ub.board.price.toString(),
        purchasedAt: ub.purchasedAt.toISOString(),
      })),
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/player/boards/pending — Pre-register purchase intent
//
// Called before MetaMask opens so the server knows a purchase
// is coming. If the frontend crashes after ETH is sent, the
// webhook can match the deposit to this pending record.
// ─────────────────────────────────────────────────────────
router.post('/boards/pending', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { boardId } = req.body;
    if (!boardId) {
      res.status(400).json({ success: false, error: 'boardId is required' });
      return;
    }
    const result = await playerService.createPendingPurchase(req.user!.userId, boardId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/player/boards/purchase — Buy a board
// ─────────────────────────────────────────────────────────
router.post('/boards/purchase', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { boardId, txHash } = purchaseBoardSchema.parse(req.body);
    const result = await playerService.purchaseBoard(req.user!.userId, boardId, txHash);
    res.json({
      success: true,
      data: {
        boardId: result.board.id,
        boardName: result.board.name,
        message: `Successfully purchased ${result.board.name}!`,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/player/sync-purchases — Reconcile missed purchases
//
// If a wallet user's MetaMask tx succeeded but the API call
// timed out, the frontend sends pending txHashes here to
// retroactively create ownership records.
// ─────────────────────────────────────────────────────────
router.post('/sync-purchases', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { txHashes } = req.body;
    if (!Array.isArray(txHashes) || txHashes.length === 0) {
      res.status(400).json({ success: false, error: 'txHashes array is required' });
      return;
    }
    const result = await playerService.syncPurchases(req.user!.userId, txHashes);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/player/transactions — Transaction history
// ─────────────────────────────────────────────────────────
router.get('/transactions', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const result = await playerService.getTransactions(req.user!.userId, page, limit);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/player/claimable — Get claimable earnings balance
// ─────────────────────────────────────────────────────────
router.get('/claimable', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const claimable = await playerService.calculateClaimableBalance(req.user!.userId);
    res.json({ success: true, data: { claimable: claimable.toFixed(8) } });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/player/claim-earnings — Claim accumulated winnings
//
// Money stays in treasury until the winner comes here and
// clicks "Claim". Only then does ETH move on-chain.
// ─────────────────────────────────────────────────────────
router.post('/claim-earnings', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await playerService.claimEarnings(req.user!.userId);
    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/player/withdraw — Real on-chain withdrawal
// ─────────────────────────────────────────────────────────
router.post('/withdraw', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { amount, toAddress } = withdrawSchema.parse(req.body);
    const balance = await playerService.calculateBalance(req.user!.userId);

    if (balance < amount) {
      res.status(402).json({
        success: false,
        error: `Insufficient balance. Have ${balance.toFixed(6)} ETH, requested ${amount} ETH`,
      });
      return;
    }

    const { prisma } = await import('../config/database');
    const { Decimal } = await import('@prisma/client/runtime/library');

    // Look up user encrypted key for wallet signing
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { encryptedKey: true, authMethod: true },
    });

    if (!user?.encryptedKey || user.authMethod !== 'EMAIL') {
      res.status(400).json({
        success: false,
        error: 'On-chain withdrawals are only available for email accounts with game wallets',
      });
      return;
    }

    // Create pending withdrawal transaction
    const dbTx = await prisma.transaction.create({
      data: {
        userId: req.user!.userId,
        type: 'WITHDRAWAL',
        amount: new Decimal(amount),
        status: 'PENDING',
        metadata: { toAddress },
      },
    });

    // Execute real on-chain withdrawal
    const result = await executeWithdrawal(req.user!.userId, user.encryptedKey, amount, toAddress);

    if (result.status === 'CONFIRMED') {
      await prisma.transaction.update({
        where: { id: dbTx.id },
        data: {
          status: 'CONFIRMED',
          txHash: result.txHash,
          confirmedAt: new Date(),
        },
      });

      res.json({
        success: true,
        data: {
          transactionId: dbTx.id,
          txHash: result.txHash,
          amount: amount.toString(),
          toAddress,
          status: 'CONFIRMED',
          message: `Withdrawal of ${amount} ETH sent to ${toAddress}`,
        },
      });
    } else {
      await prisma.transaction.update({
        where: { id: dbTx.id },
        data: { status: 'FAILED', metadata: { toAddress, error: result.error } },
      });

      res.status(500).json({
        success: false,
        error: result.error || 'Withdrawal transaction failed',
      });
    }
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/player/sync-deposits — Detect new on-chain deposits
// ─────────────────────────────────────────────────────────
router.post('/sync-deposits', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await syncDeposits(req.user!.userId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/player/full-balance — DB balance + on-chain balance
// ─────────────────────────────────────────────────────────
router.get('/full-balance', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { prisma } = await import('../config/database');
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { gameWallet: true },
    });
    const result = await getFullBalance(req.user!.userId, user?.gameWallet || null);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/player/export-key — Export game wallet private key
// ─────────────────────────────────────────────────────────
router.get('/export-key', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { prisma } = await import('../config/database');
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { encryptedKey: true, authMethod: true, gameWallet: true },
    });

    if (!user?.encryptedKey || user.authMethod !== 'EMAIL') {
      res.status(400).json({
        success: false,
        error: 'Private key export is only available for email accounts with game wallets',
      });
      return;
    }

    const { decryptPrivateKey } = await import('../utils/wallet');
    const privateKey = decryptPrivateKey(user.encryptedKey);

    res.json({
      success: true,
      data: {
        address: user.gameWallet,
        privateKey,
        warning: 'Never share your private key. Anyone with this key has full control of your wallet funds. Import this into MetaMask or any Ethereum wallet.',
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
