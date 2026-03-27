/**
 * Referee Service — Backend "Source of Truth"
 *
 * This service:
 * 1. Watches the ChainPongEscrow contract for MatchReady events
 * 2. Signals players via WebSocket to start the game
 * 3. After game ends, calls settleMatch() on the contract with the winner
 * 4. Uses a dedicated admin wallet for signing resolve transactions
 *
 * Architecture:
 * - The backend NEVER touches player funds directly
 * - All money is held in the smart contract escrow
 * - Backend only has permission to call settleMatch/disputeMatch (resolver role)
 */

import { ethers } from 'ethers';
import { ESCROW_ABI } from '../contracts/escrowAbi';
import { env } from '../config/env';
import { prisma } from '../config/database';

// ─── Configuration ───────────────────────────────────────
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY; // Resolver wallet key

// Minimum match duration in seconds (anti-cheat)
const MIN_MATCH_DURATION_SEC = 30;

// ─── Provider & Signer ──────────────────────────────────
let provider: ethers.JsonRpcProvider;
let adminSigner: ethers.Wallet;
let escrowContract: ethers.Contract;
let isInitialized = false;

/**
 * Initialize the referee service.
 * Call this once on server startup.
 */
export function initReferee(): boolean {
  if (!CONTRACT_ADDRESS) {
    console.log('[REFEREE] No CONTRACT_ADDRESS set — running in legacy (direct transfer) mode');
    return false;
  }
  if (!ADMIN_PRIVATE_KEY) {
    console.warn('[REFEREE] ⚠️ No ADMIN_PRIVATE_KEY set — cannot sign resolve transactions');
    return false;
  }

  try {
    provider = new ethers.JsonRpcProvider(env.RPC_URL);
    adminSigner = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
    escrowContract = new ethers.Contract(CONTRACT_ADDRESS, ESCROW_ABI, adminSigner);

    console.log(`[REFEREE] ✅ Initialized`);
    console.log(`[REFEREE]    Contract: ${CONTRACT_ADDRESS}`);
    console.log(`[REFEREE]    Resolver: ${adminSigner.address}`);

    isInitialized = true;
    return true;
  } catch (err: any) {
    console.error('[REFEREE] ❌ Failed to initialize:', err.message);
    return false;
  }
}

/**
 * Check if the referee service is active (contract mode).
 */
export function isRefereeActive(): boolean {
  return isInitialized;
}

// ─── Contract Event Watcher ─────────────────────────────

/**
 * Start watching for MatchReady events.
 * When both players have staked, emit a WebSocket signal to start the game.
 *
 * @param onMatchReady - Callback to notify players via WebSocket
 */
export function watchMatchReady(
  onMatchReady: (matchId: string, player1: string, player2: string, stakeAmount: bigint) => void
) {
  if (!isInitialized) return;

  escrowContract.on('MatchReady', (matchId: string, player1: string, player2: string, stakeAmount: bigint) => {
    console.log(`[REFEREE] MatchReady event: ${matchId}`);
    console.log(`[REFEREE]   Player1: ${player1}`);
    console.log(`[REFEREE]   Player2: ${player2}`);
    console.log(`[REFEREE]   Stake: ${ethers.formatEther(stakeAmount)} ETH each`);

    onMatchReady(matchId, player1, player2, stakeAmount);
  });

  console.log('[REFEREE] 👀 Watching for MatchReady events...');
}

/**
 * Start watching for MatchSettled events (for logging/audit).
 */
export function watchMatchSettled(
  onSettled: (matchId: string, winner: string, payout: bigint, fee: bigint) => void
) {
  if (!isInitialized) return;

  escrowContract.on('MatchSettled', (matchId: string, winner: string, payout: bigint, fee: bigint) => {
    console.log(`[REFEREE] MatchSettled: ${matchId} → Winner: ${winner}`);
    console.log(`[REFEREE]   Payout: ${ethers.formatEther(payout)} ETH | Fee: ${ethers.formatEther(fee)} ETH`);

    onSettled(matchId, winner, payout, fee);
  });
}

// ─── Match Resolution ───────────────────────────────────

/**
 * Convert a string match ID to bytes32 (same as frontend).
 */
function matchIdToBytes32(matchId: string): string {
  return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], [matchId]));
}

/**
 * Settle a match on the smart contract.
 *
 * Called by the backend after verifying the game result.
 * Only the resolver wallet can call settleMatch on the contract.
 *
 * @param matchId - The database match ID
 * @param winnerAddress - Ethereum address of the winner
 * @param matchStartedAt - When the match started (for duration check)
 */
export async function resolveMatchOnChain(
  matchId: string,
  winnerAddress: string,
  matchStartedAt: Date
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (!isInitialized) {
    return { success: false, error: 'Referee not initialized (no contract)' };
  }

  // ── Anti-cheat: Verify match duration ──────────────
  const durationSec = (Date.now() - matchStartedAt.getTime()) / 1000;
  if (durationSec < MIN_MATCH_DURATION_SEC) {
    console.warn(`[REFEREE] ⚠️ Match ${matchId} lasted only ${durationSec.toFixed(0)}s — flagging as disputed`);

    try {
      const bytes32Id = matchIdToBytes32(matchId);
      const tx = await escrowContract.disputeMatch(bytes32Id);
      await tx.wait(1);
      return { success: false, txHash: tx.hash, error: `Match too short (${durationSec.toFixed(0)}s) — disputed on-chain` };
    } catch (err: any) {
      return { success: false, error: `Dispute tx failed: ${err.message}` };
    }
  }

  // ── Verify winner address ─────────────────────────
  if (!ethers.isAddress(winnerAddress)) {
    return { success: false, error: `Invalid winner address: ${winnerAddress}` };
  }

  // ── Verify match state on-chain ───────────────────
  const bytes32Id = matchIdToBytes32(matchId);
  try {
    const onChainMatch = await escrowContract.getMatch(bytes32Id);
    const state = Number(onChainMatch.state);

    if (state !== 2) { // MatchState.Active
      return { success: false, error: `Match not active on-chain (state: ${state})` };
    }

    // Verify winner is a participant
    const p1 = onChainMatch.player1.toLowerCase();
    const p2 = onChainMatch.player2.toLowerCase();
    const winner = winnerAddress.toLowerCase();
    if (winner !== p1 && winner !== p2) {
      return { success: false, error: `Winner ${winnerAddress} is not a match participant` };
    }
  } catch (err: any) {
    console.error(`[REFEREE] Failed to read on-chain match state:`, err.message);
    // Continue with settlement attempt — contract will reject if invalid
  }

  // ── Send settleMatch transaction ──────────────────
  try {
    console.log(`[REFEREE] Settling match ${matchId} → winner: ${winnerAddress}`);

    // Get optimal gas price
    const feeData = await provider.getFeeData();
    const maxFeePerGas = feeData.maxFeePerGas
      ? (feeData.maxFeePerGas * 120n) / 100n // 20% buffer
      : undefined;

    const tx = await escrowContract.settleMatch(bytes32Id, winnerAddress, {
      maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    });

    console.log(`[REFEREE] Settle tx sent: ${tx.hash}`);
    const receipt = await tx.wait(2); // Wait for 2 confirmations

    console.log(`[REFEREE] ✅ Match ${matchId} settled in block ${receipt.blockNumber}`);

    // Update DB with on-chain tx hash
    await prisma.match.update({
      where: { id: matchId },
      data: {
        payoutTxHash: tx.hash,
        onChainSynced: true,
      },
    }).catch(() => {}); // Non-critical

    return { success: true, txHash: tx.hash };
  } catch (err: any) {
    console.error(`[REFEREE] ❌ settleMatch failed for ${matchId}:`, err.message);
    return { success: false, error: err.message };
  }
}

// ─── Developer Earnings Withdrawal Script ───────────────

/**
 * Withdraw accumulated developer earnings from the contract.
 * This should be called manually by the owner (not automated).
 */
export async function withdrawDevEarnings(): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (!isInitialized) {
    return { success: false, error: 'Referee not initialized' };
  }

  try {
    const earnings = await escrowContract.totalDeveloperEarnings();
    if (earnings === 0n) {
      return { success: false, error: 'No earnings to withdraw' };
    }

    console.log(`[REFEREE] Withdrawing ${ethers.formatEther(earnings)} ETH developer earnings...`);

    const tx = await escrowContract.withdrawEarnings();
    const receipt = await tx.wait(2);

    console.log(`[REFEREE] ✅ Earnings withdrawn in block ${receipt.blockNumber}`);
    return { success: true, txHash: tx.hash };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Contract Stats ─────────────────────────────────────

export async function getContractStats() {
  if (!isInitialized) return null;

  try {
    const [totalMatches, totalVolume, devEarnings, totalWithdrawn, balance] = await Promise.all([
      escrowContract.totalMatches(),
      escrowContract.totalVolume(),
      escrowContract.totalDeveloperEarnings(),
      escrowContract.totalWithdrawn(),
      escrowContract.getContractBalance(),
    ]);

    return {
      totalMatches: Number(totalMatches),
      totalVolume: ethers.formatEther(totalVolume),
      devEarnings: ethers.formatEther(devEarnings),
      totalWithdrawn: ethers.formatEther(totalWithdrawn),
      contractBalance: ethers.formatEther(balance),
    };
  } catch (err: any) {
    console.error('[REFEREE] Failed to read contract stats:', err.message);
    return null;
  }
}
