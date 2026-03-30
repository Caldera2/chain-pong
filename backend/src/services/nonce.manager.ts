/**
 * Prisma-Based Nonce Manager for Serverless Environments
 *
 * Problem: When 10 matches end simultaneously on Vercel, 10 serverless
 * instances spin up. They all try to use the same admin wallet nonce.
 * Without coordination, 9 of 10 transactions fail with "nonce too low".
 *
 * Solution: Use a Postgres row lock (SELECT FOR UPDATE) to serialize
 * nonce access across all serverless instances. Only one instance can
 * hold the lock at a time. The lock auto-expires after 30 seconds
 * (in case a function crashes mid-flight).
 *
 * Flow:
 * 1. acquireNonce() → locks the row, returns the next nonce
 * 2. Send the transaction using that nonce
 * 3. commitNonce() → increments the nonce, releases the lock
 * 4. If tx fails → rollbackNonce() releases the lock without incrementing
 */

import { ethers } from 'ethers';
import { prisma } from '../config/database';

const LOCK_TIMEOUT_MS = 30_000; // 30 seconds — stale locks are force-released
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAY_MS = 500;

interface NonceTicket {
  nonce: number;
  instanceId: string;
  walletAddress: string;
}

/**
 * Generate a unique instance ID for this serverless invocation.
 */
function getInstanceId(): string {
  return `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Acquire the next available nonce with a Postgres row lock.
 * Blocks (with retry) until the lock is obtained.
 *
 * @param walletAddress - The admin wallet address
 * @param provider - ethers provider (for initial nonce sync)
 */
export async function acquireNonce(
  walletAddress: string,
  provider: ethers.JsonRpcProvider
): Promise<NonceTicket> {
  const instanceId = getInstanceId();
  const normalizedAddr = walletAddress.toLowerCase();

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const ticket = await prisma.$transaction(async (tx) => {
        // Try to get existing nonce state with row lock
        const rows = await tx.$queryRawUnsafe<any[]>(
          `SELECT * FROM nonce_state WHERE wallet_address = $1 FOR UPDATE NOWAIT`,
          normalizedAddr
        );

        let state = rows[0];

        if (!state) {
          // First time — fetch nonce from chain and create row
          const chainNonce = await provider.getTransactionCount(walletAddress, 'pending');

          await tx.nonceState.create({
            data: {
              walletAddress: normalizedAddr,
              currentNonce: chainNonce,
              lockedBy: instanceId,
              lockedAt: new Date(),
            },
          });

          return { nonce: chainNonce, instanceId, walletAddress: normalizedAddr };
        }

        // Check if locked by another instance
        if (state.locked_by && state.locked_by !== instanceId) {
          const lockedAt = new Date(state.locked_at).getTime();
          const isStale = Date.now() - lockedAt > LOCK_TIMEOUT_MS;

          if (!isStale) {
            throw new Error('LOCKED'); // Will retry
          }

          // Stale lock — force release and re-sync nonce from chain
          console.warn(`[NONCE] Force-releasing stale lock held by ${state.locked_by}`);
          const chainNonce = await provider.getTransactionCount(walletAddress, 'pending');

          await tx.nonceState.update({
            where: { walletAddress: normalizedAddr },
            data: {
              currentNonce: chainNonce,
              lockedBy: instanceId,
              lockedAt: new Date(),
            },
          });

          return { nonce: chainNonce, instanceId, walletAddress: normalizedAddr };
        }

        // Lock is free — acquire it
        await tx.nonceState.update({
          where: { walletAddress: normalizedAddr },
          data: {
            lockedBy: instanceId,
            lockedAt: new Date(),
          },
        });

        return { nonce: state.current_nonce, instanceId, walletAddress: normalizedAddr };
      });

      return ticket;
    } catch (err: any) {
      if (err.message === 'LOCKED' || err.code === 'P2034') {
        // Row is locked — wait and retry
        const delay = RETRY_DELAY_MS * (attempt + 1); // linear backoff
        console.log(`[NONCE] Lock busy, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }

  throw new Error(`[NONCE] Failed to acquire nonce lock after ${MAX_RETRY_ATTEMPTS} attempts`);
}

/**
 * Commit after successful transaction — increment nonce and release lock.
 */
export async function commitNonce(ticket: NonceTicket): Promise<void> {
  await prisma.nonceState.update({
    where: { walletAddress: ticket.walletAddress },
    data: {
      currentNonce: ticket.nonce + 1,
      lockedBy: null,
      lockedAt: null,
    },
  });
}

/**
 * Rollback after failed transaction — release lock WITHOUT incrementing.
 * Also re-syncs nonce from chain in case it drifted.
 */
export async function rollbackNonce(
  ticket: NonceTicket,
  provider: ethers.JsonRpcProvider
): Promise<void> {
  try {
    // Re-sync from chain in case a prior tx went through
    const chainNonce = await provider.getTransactionCount(ticket.walletAddress, 'pending');

    await prisma.nonceState.update({
      where: { walletAddress: ticket.walletAddress },
      data: {
        currentNonce: chainNonce,
        lockedBy: null,
        lockedAt: null,
      },
    });
  } catch (err: any) {
    // At minimum, release the lock
    console.error('[NONCE] Rollback sync failed, releasing lock:', err.message);
    await prisma.nonceState.updateMany({
      where: { walletAddress: ticket.walletAddress, lockedBy: ticket.instanceId },
      data: { lockedBy: null, lockedAt: null },
    }).catch(() => {});
  }
}
