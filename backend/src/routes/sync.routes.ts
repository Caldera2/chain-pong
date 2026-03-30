/**
 * Sync Routes — Poll for pending on-chain transaction confirmations.
 *
 * Since Vercel is serverless, we can't reliably wait for tx.wait().
 * The referee sends the tx, saves the hash to PendingTx table as PENDING,
 * and returns immediately. This route lets the frontend (or a cron job)
 * check if pending transactions have been confirmed.
 *
 * POST /api/sync-match  — Check & update a specific pending tx
 * GET  /api/sync-match  — Process all pending transactions (batch)
 */

import { Router, Response, NextFunction } from 'express';
import { ethers } from 'ethers';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { AuthRequest } from '../types';

const router = Router();

const MAX_PENDING_AGE_HOURS = 2; // Transactions older than this are marked FAILED

/**
 * POST /api/sync-match — Check a specific pending transaction by txHash.
 * Returns the current status.
 */
router.post('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { txHash } = req.body;
    if (!txHash) {
      res.status(400).json({ success: false, error: 'txHash is required' });
      return;
    }

    const pending = await prisma.pendingTx.findUnique({ where: { txHash } });
    if (!pending) {
      res.status(404).json({ success: false, error: 'Transaction not found' });
      return;
    }

    // Already confirmed or failed — just return status
    if (pending.status !== 'PENDING') {
      res.json({
        success: true,
        data: {
          txHash: pending.txHash,
          matchId: pending.matchId,
          status: pending.status,
          blockNumber: pending.blockNumber?.toString(),
          confirmedAt: pending.confirmedAt,
        },
      });
      return;
    }

    // Check on-chain
    const result = await checkAndUpdateTx(pending.txHash, pending.matchId, pending.createdAt);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sync-match — Process all pending transactions (batch sync).
 * Useful as a cron endpoint or manual trigger.
 */
router.get('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const pendingTxs = await prisma.pendingTx.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    const results = [];
    for (const ptx of pendingTxs) {
      const result = await checkAndUpdateTx(ptx.txHash, ptx.matchId, ptx.createdAt);
      results.push(result);
    }

    res.json({
      success: true,
      data: {
        processed: results.length,
        confirmed: results.filter(r => r.status === 'CONFIRMED').length,
        failed: results.filter(r => r.status === 'FAILED').length,
        stillPending: results.filter(r => r.status === 'PENDING').length,
        results,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Check a single pending transaction on-chain and update the DB.
 */
async function checkAndUpdateTx(
  txHash: string,
  matchId: string,
  createdAt: Date
): Promise<{ txHash: string; matchId: string; status: string; blockNumber?: string }> {
  const provider = new ethers.JsonRpcProvider(env.RPC_URL);

  try {
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      // Not mined yet — check if it's too old
      const ageHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
      if (ageHours > MAX_PENDING_AGE_HOURS) {
        // Too old — likely dropped from mempool
        await prisma.pendingTx.update({
          where: { txHash },
          data: {
            status: 'FAILED',
            error: `Transaction not mined after ${MAX_PENDING_AGE_HOURS} hours`,
            attempts: { increment: 1 },
          },
        });
        return { txHash, matchId, status: 'FAILED' };
      }

      // Still pending
      await prisma.pendingTx.update({
        where: { txHash },
        data: { attempts: { increment: 1 } },
      });
      return { txHash, matchId, status: 'PENDING' };
    }

    if (receipt.status === 1) {
      // Confirmed successfully
      await Promise.all([
        prisma.pendingTx.update({
          where: { txHash },
          data: {
            status: 'CONFIRMED',
            confirmedAt: new Date(),
            blockNumber: BigInt(receipt.blockNumber),
          },
        }),
        prisma.match.update({
          where: { id: matchId },
          data: { payoutTxHash: txHash, onChainSynced: true },
        }).catch(() => {}),
      ]);

      return { txHash, matchId, status: 'CONFIRMED', blockNumber: receipt.blockNumber.toString() };
    } else {
      // Reverted
      await prisma.pendingTx.update({
        where: { txHash },
        data: { status: 'FAILED', error: 'Transaction reverted on-chain' },
      });

      return { txHash, matchId, status: 'FAILED' };
    }
  } catch (err: any) {
    console.error(`[SYNC] Error checking tx ${txHash}:`, err.message);
    return { txHash, matchId, status: 'PENDING' };
  }
}

export default router;
