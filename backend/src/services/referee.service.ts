/**
 * Referee Service — Backend "Source of Truth"
 *
 * This service:
 * 1. Watches the ChainPongEscrow contract for MatchReady events
 * 2. Signals players via WebSocket to start the game
 * 3. After game ends, signs EIP-712 proof + calls settleMatch() on contract
 * 4. Uses Prisma-based nonce manager for serverless-safe concurrency
 * 5. Checks gas profitability before settling (4% fee must exceed gas cost)
 * 6. Sends Discord webhook alerts for low gas / high payout situations
 *
 * The backend NEVER touches player funds directly.
 * All money is held in the smart contract escrow.
 */

import { ethers } from 'ethers';
import { ESCROW_ABI } from '../contracts/escrowAbi';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { acquireNonce, commitNonce, rollbackNonce } from './nonce.manager';

// ─── Configuration ───────────────────────────────────────
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

const MIN_MATCH_DURATION_SEC = 30;
const MIN_ADMIN_BALANCE_ETH = 0.005;  // Alert + block if below this
const PROTOCOL_FEE_BPS = 400;         // 4%

// ─── EIP-712 Domain ─────────────────────────────────────
const EIP712_DOMAIN = {
  name: 'ChainPongEscrow',
  version: '1',
  // chainId and verifyingContract set at init time
} as { name: string; version: string; chainId?: number; verifyingContract?: string };

const MATCH_PERMIT_TYPES = {
  MatchPermit: [
    { name: 'matchId', type: 'bytes32' },
    { name: 'player', type: 'address' },
    { name: 'stakeAmount', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

const SETTLE_PROOF_TYPES = {
  SettleProof: [
    { name: 'matchId', type: 'bytes32' },
    { name: 'winner', type: 'address' },
    { name: 'player1Score', type: 'uint256' },
    { name: 'player2Score', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

// ─── Provider & Signer ──────────────────────────────────
let provider: ethers.JsonRpcProvider;
let adminSigner: ethers.Wallet;
let escrowContract: ethers.Contract;
let isInitialized = false;

export function initReferee(): boolean {
  if (!CONTRACT_ADDRESS) {
    console.log('[REFEREE] No CONTRACT_ADDRESS set — running in legacy mode');
    return false;
  }
  if (!ADMIN_PRIVATE_KEY) {
    console.warn('[REFEREE] No ADMIN_PRIVATE_KEY set — cannot sign transactions');
    return false;
  }

  try {
    provider = new ethers.JsonRpcProvider(env.RPC_URL);
    adminSigner = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
    escrowContract = new ethers.Contract(CONTRACT_ADDRESS, ESCROW_ABI, adminSigner);

    // Complete EIP-712 domain
    EIP712_DOMAIN.chainId = env.CHAIN_ID;
    EIP712_DOMAIN.verifyingContract = CONTRACT_ADDRESS;

    console.log(`[REFEREE] Initialized`);
    console.log(`[REFEREE]   Contract: ${CONTRACT_ADDRESS}`);
    console.log(`[REFEREE]   Resolver: ${adminSigner.address}`);
    console.log(`[REFEREE]   Chain ID: ${env.CHAIN_ID}`);

    isInitialized = true;
    return true;
  } catch (err: any) {
    console.error('[REFEREE] Failed to initialize:', err.message);
    return false;
  }
}

export function isRefereeActive(): boolean {
  return isInitialized;
}

// ─── EIP-712 Signing ────────────────────────────────────

/**
 * Sign a match permit for a player. The frontend presents this to the
 * contract's createMatch/joinMatch. Only pre-approved players can stake.
 */
export async function signMatchPermit(
  matchId: string,
  playerAddress: string,
  stakeAmountWei: bigint
): Promise<{ signature: string; deadline: number }> {
  if (!isInitialized) throw new Error('Referee not initialized');

  const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes
  const bytes32Id = matchIdToBytes32(matchId);

  const signature = await adminSigner.signTypedData(
    EIP712_DOMAIN,
    MATCH_PERMIT_TYPES,
    {
      matchId: bytes32Id,
      player: playerAddress,
      stakeAmount: stakeAmountWei,
      deadline,
    }
  );

  return { signature, deadline };
}

/**
 * Sign a settle proof for a match result. Provides cryptographic
 * audit trail that can't be forged — even if msg.sender check is bypassed.
 */
async function signSettleProof(
  matchId: string,
  winnerAddress: string,
  player1Score: number,
  player2Score: number
): Promise<{ signature: string; deadline: number }> {
  const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes
  const bytes32Id = matchIdToBytes32(matchId);

  const signature = await adminSigner.signTypedData(
    EIP712_DOMAIN,
    SETTLE_PROOF_TYPES,
    {
      matchId: bytes32Id,
      winner: winnerAddress,
      player1Score,
      player2Score,
      deadline,
    }
  );

  return { signature, deadline };
}

// ─── Discord Webhook Alerts ──────────────────────────────

async function sendDiscordAlert(message: string, level: 'info' | 'warn' | 'error' = 'warn') {
  if (!DISCORD_WEBHOOK_URL) {
    console.log(`[REFEREE] [${level.toUpperCase()}] ${message}`);
    return;
  }

  const colors = { info: 0x3498db, warn: 0xf39c12, error: 0xe74c3c };

  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: `Chain Pong Referee [${level.toUpperCase()}]`,
          description: message,
          color: colors[level],
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  } catch (err: any) {
    console.error('[REFEREE] Discord webhook failed:', err.message);
  }
}

// ─── Gas Profitability Check ─────────────────────────────

/**
 * Check if settling this match is profitable.
 * The 4% dev fee must exceed the gas cost, otherwise it's a net loss.
 *
 * On Base L2, gas is cheap but the L1 data fee is the silent killer.
 * We estimate total cost = (gas price * gas limit) + L1 data overhead.
 */
async function checkGasProfitability(
  stakeAmountEth: number
): Promise<{ profitable: boolean; gasCostEth: number; feeEarned: number; reason?: string }> {
  const pot = stakeAmountEth * 2;
  const feeEarned = (pot * PROTOCOL_FEE_BPS) / 10000;

  try {
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.maxFeePerGas || feeData.gasPrice || ethers.parseUnits('0.1', 'gwei');

    // settleMatch uses ~100k gas + L1 data fee overhead (~50k gas equivalent on Base)
    const estimatedGas = 150000n;
    const gasCostWei = gasPrice * estimatedGas;
    const gasCostEth = Number(ethers.formatEther(gasCostWei));

    if (gasCostEth > feeEarned) {
      return {
        profitable: false,
        gasCostEth,
        feeEarned,
        reason: `Gas (${gasCostEth.toFixed(6)} ETH) exceeds fee (${feeEarned.toFixed(6)} ETH)`,
      };
    }

    return { profitable: true, gasCostEth, feeEarned };
  } catch (err: any) {
    // Can't estimate — proceed anyway (Base gas is usually very cheap)
    console.warn('[REFEREE] Gas estimation failed, proceeding:', err.message);
    return { profitable: true, gasCostEth: 0, feeEarned };
  }
}

// ─── Contract Event Watchers ────────────────────────────

export function watchMatchReady(
  onMatchReady: (matchId: string, player1: string, player2: string, stakeAmount: bigint) => void
) {
  if (!isInitialized) return;

  escrowContract.on('MatchReady', (matchId: string, player1: string, player2: string, stakeAmount: bigint) => {
    console.log(`[REFEREE] MatchReady: ${matchId} | P1: ${player1} | P2: ${player2}`);
    onMatchReady(matchId, player1, player2, stakeAmount);
  });

  console.log('[REFEREE] Watching for MatchReady events...');
}

export function watchMatchSettled(
  onSettled: (matchId: string, winner: string, payout: bigint, fee: bigint) => void
) {
  if (!isInitialized) return;

  escrowContract.on('MatchSettled', (matchId: string, winner: string, payout: bigint, fee: bigint) => {
    console.log(`[REFEREE] MatchSettled: ${matchId} | Winner: ${winner} | Payout: ${ethers.formatEther(payout)} ETH`);
    onSettled(matchId, winner, payout, fee);
  });
}

// ─── Core: Settle Match On-Chain ────────────────────────

function matchIdToBytes32(matchId: string): string {
  return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], [matchId]));
}

/**
 * Settle a match on the smart contract with EIP-712 signed proof.
 *
 * Uses the Prisma nonce manager for serverless-safe concurrency.
 * If 10 matches end simultaneously, they queue via Postgres row locks.
 */
export async function resolveMatchOnChain(
  matchId: string,
  winnerAddress: string,
  player1Score: number,
  player2Score: number,
  matchStartedAt: Date,
  stakeAmountEth: number
): Promise<{ success: boolean; txHash?: string; error?: string; pending?: boolean }> {
  if (!isInitialized) {
    return { success: false, error: 'Referee not initialized (no contract)' };
  }

  // ── Anti-cheat: Match duration ──────────────────────
  const durationSec = (Date.now() - matchStartedAt.getTime()) / 1000;
  if (durationSec < MIN_MATCH_DURATION_SEC) {
    console.warn(`[REFEREE] Match ${matchId} lasted ${durationSec.toFixed(0)}s — disputing`);
    await sendDiscordAlert(
      `Match \`${matchId}\` lasted only ${durationSec.toFixed(0)}s — flagging as fraud`,
      'error'
    );

    try {
      const bytes32Id = matchIdToBytes32(matchId);
      const tx = await escrowContract.disputeMatch(bytes32Id);
      await tx.wait(1);
      return { success: false, txHash: tx.hash, error: `Match too short — disputed` };
    } catch (err: any) {
      return { success: false, error: `Dispute failed: ${err.message}` };
    }
  }

  // ── Validate winner address ─────────────────────────
  if (!ethers.isAddress(winnerAddress)) {
    return { success: false, error: `Invalid winner address: ${winnerAddress}` };
  }

  // ── Gas check: admin wallet balance ─────────────────
  try {
    const adminBalance = await provider.getBalance(adminSigner.address);
    const adminEth = Number(ethers.formatEther(adminBalance));

    if (adminEth < MIN_ADMIN_BALANCE_ETH) {
      await sendDiscordAlert(
        `ADMIN WALLET LOW: ${adminEth.toFixed(4)} ETH (need ${MIN_ADMIN_BALANCE_ETH})\n` +
        `Top up: \`${adminSigner.address}\``,
        'error'
      );
      return { success: false, error: 'Admin wallet has insufficient gas. Top up required.' };
    }
  } catch (err: any) {
    console.warn('[REFEREE] Could not check admin balance:', err.message);
  }

  // ── Gas profitability check ─────────────────────────
  const profitCheck = await checkGasProfitability(stakeAmountEth);
  if (!profitCheck.profitable) {
    console.warn(`[REFEREE] Unprofitable settle: ${profitCheck.reason}`);
    await sendDiscordAlert(
      `Unprofitable settle for match \`${matchId}\`\n` +
      `Gas: ${profitCheck.gasCostEth.toFixed(6)} ETH | Fee earned: ${profitCheck.feeEarned.toFixed(6)} ETH\n` +
      `Proceeding anyway (queued).`,
      'warn'
    );
    // Still proceed — but alert so admin can raise minStake if this keeps happening
  }

  // ── Verify on-chain state ───────────────────────────
  const bytes32Id = matchIdToBytes32(matchId);
  try {
    const onChainMatch = await escrowContract.getMatch(bytes32Id);
    if (Number(onChainMatch.state) !== 2) { // MatchState.Active
      return { success: false, error: `Match not active on-chain (state: ${Number(onChainMatch.state)})` };
    }
  } catch (err: any) {
    console.error('[REFEREE] Failed to read on-chain state:', err.message);
  }

  // ── Sign EIP-712 settle proof ───────────────────────
  const { signature: proof, deadline } = await signSettleProof(
    matchId,
    winnerAddress,
    player1Score,
    player2Score
  );

  // ── Send transaction with Prisma nonce lock ─────────
  let ticket;
  try {
    ticket = await acquireNonce(adminSigner.address, provider);
    console.log(`[REFEREE] Acquired nonce ${ticket.nonce} for match ${matchId}`);

    const feeData = await provider.getFeeData();
    const maxFeePerGas = feeData.maxFeePerGas
      ? (feeData.maxFeePerGas * 120n) / 100n
      : undefined;

    const tx = await escrowContract.settleMatch(
      bytes32Id,
      winnerAddress,
      player1Score,
      player2Score,
      deadline,
      proof,
      {
        nonce: ticket.nonce,
        maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      }
    );

    console.log(`[REFEREE] Settle tx sent: ${tx.hash} (nonce: ${ticket.nonce})`);

    // Save pending tx to DB immediately (don't wait for confirmation)
    await prisma.pendingTx.create({
      data: {
        txHash: tx.hash,
        matchId,
        txType: 'SETTLE',
        status: 'PENDING',
      },
    }).catch(() => {}); // Non-critical

    // Commit nonce (increment) BEFORE waiting for confirmation
    // This way the next settlement can proceed immediately
    await commitNonce(ticket);
    ticket = null; // Mark as committed

    // Wait for confirmation in the background
    try {
      const receipt = await tx.wait(2);

      if (!receipt || receipt.status === 0) {
        console.error(`[REFEREE] Settle tx reverted: ${tx.hash}`);
        await prisma.pendingTx.update({
          where: { txHash: tx.hash },
          data: { status: 'FAILED', error: 'Transaction reverted' },
        }).catch(() => {});
        return { success: false, txHash: tx.hash, error: 'Transaction reverted on-chain' };
      }

      // Update DB records
      await Promise.all([
        prisma.match.update({
          where: { id: matchId },
          data: { payoutTxHash: tx.hash, onChainSynced: true },
        }).catch(() => {}),
        prisma.pendingTx.update({
          where: { txHash: tx.hash },
          data: { status: 'CONFIRMED', confirmedAt: new Date(), blockNumber: BigInt(receipt.blockNumber) },
        }).catch(() => {}),
      ]);

      console.log(`[REFEREE] Match ${matchId} settled in block ${receipt.blockNumber}`);
      return { success: true, txHash: tx.hash };
    } catch (waitErr: any) {
      // tx.wait() failed — tx might still confirm later. Return pending.
      console.warn(`[REFEREE] tx.wait() failed for ${tx.hash}: ${waitErr.message}`);
      return { success: true, txHash: tx.hash, pending: true };
    }
  } catch (err: any) {
    // Rollback nonce if we still hold the lock
    if (ticket) {
      await rollbackNonce(ticket, provider);
    }

    console.error(`[REFEREE] settleMatch failed for ${matchId}:`, err.message);

    // Alert on repeated failures
    await sendDiscordAlert(
      `settleMatch FAILED for \`${matchId}\`\nError: ${err.message}`,
      'error'
    );

    return { success: false, error: err.message };
  }
}

// ─── Developer Earnings Withdrawal ──────────────────────

export async function withdrawDevEarnings(): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (!isInitialized) {
    return { success: false, error: 'Referee not initialized' };
  }

  try {
    const earnings = await escrowContract.totalDeveloperEarnings();
    if (earnings === 0n) {
      return { success: false, error: 'No earnings to withdraw' };
    }

    console.log(`[REFEREE] Withdrawing ${ethers.formatEther(earnings)} ETH...`);

    const tx = await escrowContract.withdrawEarnings();
    const receipt = await tx.wait(2);

    await sendDiscordAlert(
      `Dev earnings withdrawn: ${ethers.formatEther(earnings)} ETH\nTX: \`${tx.hash}\``,
      'info'
    );

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
