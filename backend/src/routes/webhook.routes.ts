import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { Decimal } from '@prisma/client/runtime/library';
import { ethers } from 'ethers';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { getIO } from '../services/socket.service';

const router = Router();

// ─────────────────────────────────────────────────────────
// POST /api/webhooks/alchemy-deposit
//
// Receives Alchemy Notify "Address Activity" webhooks when
// ETH arrives at any game wallet. Replaces frontend polling.
//
// Alchemy sends:
// {
//   webhookId, id, createdAt, type: "ADDRESS_ACTIVITY",
//   event: {
//     network, activity: [{ fromAddress, toAddress, value, asset, hash, ... }]
//   }
// }
// ─────────────────────────────────────────────────────────

// Verify Alchemy webhook signature (HMAC-SHA256)
function verifyAlchemySignature(body: string, signature: string): boolean {
  const signingKey = env.ALCHEMY_WEBHOOK_SIGNING_KEY;
  if (!signingKey) return false;
  const hmac = crypto.createHmac('sha256', signingKey).update(body).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
}

router.post('/alchemy-deposit', async (req: Request, res: Response) => {
  try {
    // Verify webhook authenticity
    const signature = req.headers['x-alchemy-signature'] as string;
    if (env.ALCHEMY_WEBHOOK_SIGNING_KEY && signature) {
      const rawBody = JSON.stringify(req.body);
      if (!verifyAlchemySignature(rawBody, signature)) {
        console.warn('[WEBHOOK] Invalid Alchemy signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }
    }

    const { event } = req.body;
    if (!event?.activity || !Array.isArray(event.activity)) {
      res.status(200).json({ ok: true }); // Ack but ignore non-activity events
      return;
    }

    let processed = 0;

    for (const activity of event.activity) {
      // Only process incoming ETH transfers
      if (activity.asset !== 'ETH' || !activity.toAddress || !activity.value) continue;

      const toAddress = activity.toAddress.toLowerCase();
      const fromAddress = (activity.fromAddress || '').toLowerCase();
      const txHash = activity.hash;
      const valueEth = parseFloat(activity.value);

      // ── Dust Spam Protection ────────────────────────
      // Ignore transactions below minimum stake tier (0.001 ETH).
      // Prevents attackers from bloating Transaction table with
      // thousands of tiny transfers that slow down balance queries.
      if (valueEth < 0.001) {
        console.log(`[WEBHOOK] Ignored dust transaction: ${valueEth} ETH to ${toAddress} from ${fromAddress}`);
        continue;
      }

      // Find the user whose game wallet received this deposit
      const user = await prisma.user.findFirst({
        where: { gameWallet: { equals: toAddress, mode: 'insensitive' } },
      });

      if (!user) continue; // Not a game wallet

      // Idempotency: check if we already recorded this tx
      const existing = await prisma.transaction.findFirst({
        where: { txHash, type: 'DEPOSIT' },
      });
      if (existing) continue;

      // Record the deposit
      await prisma.transaction.create({
        data: {
          userId: user.id,
          type: 'DEPOSIT',
          amount: new Decimal(valueEth),
          status: 'CONFIRMED',
          txHash,
          confirmedAt: new Date(),
          metadata: { fromAddress, webhook: true },
        },
      });

      console.log(`[WEBHOOK] Deposit detected: ${valueEth} ETH to ${toAddress} (user ${user.id}) tx ${txHash}`);
      processed++;

      // Push real-time update to the user via Socket.IO
      try {
        const io = getIO();
        if (io) {
          // Find user's socket by scanning online users
          const sockets = await io.fetchSockets();
          for (const s of sockets) {
            const authSocket = s as any;
            if (authSocket.user?.userId === user.id) {
              s.emit('notification', {
                type: 'deposit',
                message: `Deposit received: ${valueEth} ETH`,
              });
              // Emit specific deposit event for frontend balance update
              (s as any).emit('deposit_confirmed', {
                amount: valueEth.toString(),
                txHash,
                newBalance: null, // Frontend should refetch
              });
              break;
            }
          }
        }
      } catch (socketErr) {
        // Socket push is best-effort, don't fail the webhook
        console.warn('[WEBHOOK] Socket push failed:', socketErr);
      }
    }

    console.log(`[WEBHOOK] Processed ${processed} deposits from Alchemy`);
    res.status(200).json({ ok: true, processed });
  } catch (error: any) {
    console.error('[WEBHOOK] Error processing Alchemy deposit:', error.message);
    // Always return 200 to Alchemy so it doesn't retry on our errors
    res.status(200).json({ ok: false, error: 'Internal processing error' });
  }
});

export default router;
