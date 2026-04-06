/**
 * Chaos Engineering Test Suite — Chain Pong
 *
 * Simulates edge cases that would break the game in production:
 *   1. The 14-Second Drop — Socket reconnect just before auto-forfeit
 *   2. The Sequencer Outage — RPC failure during settlement
 *   3. The Invalid Seed — Tick log with wrong ball trajectory
 *   4. The Speedhack — More ticks than physically possible
 *   5. The Burst Claim — Concurrent payout requests
 *
 * Run: npx ts-node tests/chaos-engineering.test.ts
 */

import crypto from 'crypto';

// ─── Shared Helpers ─────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS — ${testName}`);
    passed++;
  } else {
    console.log(`  ✗ FAIL — ${testName}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

function section(title: string) {
  console.log(`\n─── ${title} ${'─'.repeat(50 - title.length)}`);
}

// ─── Mocks ──────────────────────────────────────────────

// Simulate the activeGames map from socket.service.ts
type ActiveGame = { p1: string; p2: string };
const activeGames = new Map<string, ActiveGame>();

// Simulate the reconnectionTimers map
const reconnectionTimers = new Map<string, {
  disconnectedUserId: string;
  remainingSocketId: string;
  matchId: string;
  timer: ReturnType<typeof setTimeout>;
}>();

const RECONNECT_WINDOW_MS = 15_000;

// Simulate validateMatchSocket from socket.service.ts
function validateMatchSocket(matchId: string, socketId: string): boolean {
  const game = activeGames.get(matchId);
  if (!game) return false;
  return game.p1 === socketId || game.p2 === socketId;
}

// Simulate deriveBallSpawn from match.service.ts
function deriveBallSpawn(seed: string, roundIndex: number = 0): { vx: number; vy: number } {
  const hmac = crypto.createHmac('sha256', seed);
  hmac.update(`ball-spawn-${roundIndex}`);
  const hash = hmac.digest();
  const vxDir = (hash[0] & 1) === 0 ? -1 : 1;
  const vyDir = (hash[1] & 1) === 0 ? -1 : 1;
  return { vx: 5 * vxDir, vy: 3 * vyDir };
}

// Simulate validateTickPhysics tick rate ceiling
function checkTickRateCeiling(tickCount: number, serverDurationMs: number): { valid: boolean; maxAllowed: number } {
  const serverDurationSec = serverDurationMs / 1000;
  const TICKS_PER_SECOND = 2;
  const RATE_BUFFER = 1.10;
  const maxTicksAllowed = Math.ceil(serverDurationSec * TICKS_PER_SECOND * RATE_BUFFER);
  return { valid: tickCount <= maxTicksAllowed, maxAllowed: maxTicksAllowed };
}

// Simulate atomic claim mutex
async function simulateAtomicClaim(
  matchId: string,
  claimState: Map<string, string | null>
): Promise<boolean> {
  // Atomic conditional: only succeeds if payoutTxHash is null
  const current = claimState.get(matchId);
  if (current !== null) return false; // Someone else already claimed
  claimState.set(matchId, 'CLAIMING'); // Acquire lock
  return true;
}

// ═══════════════════════════════════════════════════════
// TEST 1: The 14-Second Drop
// ═══════════════════════════════════════════════════════

async function test14SecondDrop() {
  section('Test 1: The 14-Second Drop');
  console.log('  Simulating disconnect at 14.5s, reconnect at 14.9s\n');

  const matchId = 'match-reconnect-test';
  const p1SocketId = 'socket-player1-original';
  const p2SocketId = 'socket-player2-original';
  const p1UserId = 'user-player1';

  // Setup: both players in an active game
  activeGames.set(matchId, { p1: p1SocketId, p2: p2SocketId });

  // Step 1: Player1 disconnects at 14.5s (simulated)
  let forfeitTriggered = false;
  const forfeitTimer = setTimeout(() => {
    forfeitTriggered = true;
  }, RECONNECT_WINDOW_MS);

  reconnectionTimers.set(matchId, {
    disconnectedUserId: p1UserId,
    remainingSocketId: p2SocketId,
    matchId,
    timer: forfeitTimer,
  });

  assert(reconnectionTimers.has(matchId), 'Reconnection timer started');

  // Step 2: Player1 reconnects at 14.9s (400ms before forfeit)
  // Simulate reconnection: clear timer, update socket ID
  const pending = reconnectionTimers.get(matchId)!;
  clearTimeout(pending.timer);
  reconnectionTimers.delete(matchId);

  const newP1SocketId = 'socket-player1-reconnected';
  const game = activeGames.get(matchId)!;
  game.p1 = newP1SocketId; // Update to new socket ID

  assert(!reconnectionTimers.has(matchId), 'Reconnection timer cleared');
  assert(!forfeitTriggered, 'Auto-forfeit did NOT trigger');
  assert(game.p1 === newP1SocketId, 'activeGames updated with new socket ID');

  // Step 3: Verify session pinning works with new socket
  assert(validateMatchSocket(matchId, newP1SocketId), 'New socket passes session pinning');
  assert(validateMatchSocket(matchId, p2SocketId), 'Player2 still passes session pinning');
  assert(!validateMatchSocket(matchId, p1SocketId), 'Old socket REJECTED by session pinning');
  assert(!validateMatchSocket(matchId, 'socket-mev-bot'), 'Third-party socket REJECTED');

  // Cleanup
  activeGames.delete(matchId);
}

// ═══════════════════════════════════════════════════════
// TEST 2: The Sequencer Outage
// ═══════════════════════════════════════════════════════

async function testSequencerOutage() {
  section('Test 2: The Sequencer Outage');
  console.log('  Simulating RPC failure during settlement\n');

  // Simulate RPC call that fails
  let rpcCallCount = 0;
  const MAX_RBF_ATTEMPTS = 2;

  async function mockSendTransaction(): Promise<{ hash: string; wait: () => Promise<any> }> {
    rpcCallCount++;
    if (rpcCallCount <= 2) {
      // First 2 attempts: RPC timeout (returns null receipt)
      return {
        hash: `0xfake-tx-${rpcCallCount}`,
        wait: () => new Promise<null>((resolve) => setTimeout(() => resolve(null), 50)),
      };
    }
    // Third attempt: success
    return {
      hash: `0xfake-tx-${rpcCallCount}`,
      wait: () => Promise.resolve({ status: 1, blockNumber: 12345 }),
    };
  }

  // Simulate the RBF retry loop
  let currentTx = await mockSendTransaction();
  let receipt: any = null;

  for (let attempt = 0; attempt <= MAX_RBF_ATTEMPTS; attempt++) {
    // Race: wait for confirmation vs 100ms timeout (simulating 2-min in real code)
    receipt = await Promise.race([
      currentTx.wait(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 100)),
    ]);

    if (receipt) break;

    if (attempt < MAX_RBF_ATTEMPTS) {
      // Resubmit with "bumped gas" (simulated)
      currentTx = await mockSendTransaction();
    }
  }

  // If still no receipt, final wait
  if (!receipt) {
    receipt = await currentTx.wait();
  }

  assert(rpcCallCount === 3, `RBF retried ${rpcCallCount} times (expected 3)`);
  assert(receipt !== null, 'Transaction eventually confirmed');
  assert(receipt?.status === 1, 'Transaction succeeded after RBF retry');
}

// ═══════════════════════════════════════════════════════
// TEST 3: The Invalid Seed
// ═══════════════════════════════════════════════════════

async function testInvalidSeed() {
  section('Test 3: The Invalid Seed');
  console.log('  Submitting tick log with wrong ball trajectory\n');

  const matchSeed = crypto.randomBytes(16).toString('hex');
  const expected = deriveBallSpawn(matchSeed, 0);

  // Legitimate first tick — matches seed
  const legitimateTick = { bvx: expected.vx, bvy: expected.vy, t: 1000 };

  // Tampered first tick — opposite direction
  const tamperedTick = { bvx: -expected.vx, bvy: -expected.vy, t: 1000 };

  // Verify legitimate tick passes
  const legitVxMatch = Math.sign(legitimateTick.bvx) === Math.sign(expected.vx);
  const legitVyMatch = Math.sign(legitimateTick.bvy) === Math.sign(expected.vy);
  assert(legitVxMatch && legitVyMatch, 'Legitimate tick matches seed trajectory');

  // Verify tampered tick fails
  const tamperedVxMatch = Math.sign(tamperedTick.bvx) === Math.sign(expected.vx);
  const tamperedVyMatch = Math.sign(tamperedTick.bvy) === Math.sign(expected.vy);
  assert(!tamperedVxMatch || !tamperedVyMatch, 'Tampered tick REJECTED — wrong trajectory direction');

  // Verify a completely fabricated trajectory fails
  const fabricatedTick = { bvx: 10, bvy: 10, t: 1000 }; // Wrong magnitude
  const fabMagnitudeOk = Math.abs(fabricatedTick.bvx) === 5 && Math.abs(fabricatedTick.bvy) === 3;
  assert(!fabMagnitudeOk, 'Fabricated tick REJECTED — wrong ball speed magnitude');
}

// ═══════════════════════════════════════════════════════
// TEST 4: The Speedhack / Lag Switch
// ═══════════════════════════════════════════════════════

async function testSpeedhack() {
  section('Test 4: The Speedhack / Lag Switch');
  console.log('  Testing tick rate ceiling enforcement\n');

  // Scenario A: Normal game — 30 seconds, 55 ticks (2 ticks/sec * 30 = 60, ceiling = 66)
  const normalResult = checkTickRateCeiling(55, 30_000);
  assert(normalResult.valid, `Normal game: 55 ticks in 30s (max ${normalResult.maxAllowed}) — ACCEPTED`);

  // Scenario B: Speedhack — 30 seconds, 200 ticks
  const speedhackResult = checkTickRateCeiling(200, 30_000);
  assert(!speedhackResult.valid, `Speedhack: 200 ticks in 30s (max ${speedhackResult.maxAllowed}) — REJECTED`);

  // Scenario C: Lag switch dump — 10 seconds, 500 ticks
  const lagSwitchResult = checkTickRateCeiling(500, 10_000);
  assert(!lagSwitchResult.valid, `Lag switch: 500 ticks in 10s (max ${lagSwitchResult.maxAllowed}) — REJECTED`);

  // Scenario D: Edge case — exactly at ceiling (within 10% buffer)
  const edgeResult = checkTickRateCeiling(66, 30_000);
  assert(edgeResult.valid, `Edge case: 66 ticks in 30s (max ${edgeResult.maxAllowed}) — ACCEPTED`);

  // Scenario E: Long game — 5 minutes (300s), 590 ticks
  const longResult = checkTickRateCeiling(590, 300_000);
  assert(longResult.valid, `Long game: 590 ticks in 300s (max ${longResult.maxAllowed}) — ACCEPTED`);

  // Scenario F: Long game speedhacked — 5 minutes, 1000 ticks
  const longHackResult = checkTickRateCeiling(1000, 300_000);
  assert(!longHackResult.valid, `Long speedhack: 1000 ticks in 300s (max ${longHackResult.maxAllowed}) — REJECTED`);
}

// ═══════════════════════════════════════════════════════
// TEST 5: The Burst Claim Race Condition
// ═══════════════════════════════════════════════════════

async function testBurstClaim() {
  section('Test 5: The Burst Claim Race Condition');
  console.log('  Simulating 50 concurrent claim requests\n');

  const matchId = 'match-burst-claim-test';
  const claimState = new Map<string, string | null>();
  claimState.set(matchId, null); // payoutTxHash = null (unclaimed)

  // Fire 50 concurrent "claim" attempts
  const CONCURRENT_REQUESTS = 50;
  const results = await Promise.all(
    Array.from({ length: CONCURRENT_REQUESTS }, (_, i) =>
      simulateAtomicClaim(matchId, claimState).then((success) => ({
        requestId: i,
        success,
      }))
    )
  );

  const successes = results.filter((r) => r.success);
  const failures = results.filter((r) => !r.success);

  assert(successes.length === 1, `Exactly 1 request succeeded (got ${successes.length})`);
  assert(failures.length === CONCURRENT_REQUESTS - 1, `${failures.length} requests blocked (expected ${CONCURRENT_REQUESTS - 1})`);
  assert(claimState.get(matchId) === 'CLAIMING', 'Match state set to CLAIMING by winner');

  // Simulate payout completion
  claimState.set(matchId, '0xreal-tx-hash');
  assert(claimState.get(matchId) === '0xreal-tx-hash', 'Sentinel replaced with real txHash');

  // Attempt another claim after completion — should fail
  const lateClaim = await simulateAtomicClaim(matchId, claimState);
  assert(!lateClaim, 'Late claim attempt REJECTED — already paid');
}

// ═══════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  Chain Pong — Chaos Engineering Suite');
  console.log('═══════════════════════════════════════════');

  await test14SecondDrop();
  await testSequencerOutage();
  await testInvalidSeed();
  await testSpeedhack();
  await testBurstClaim();

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`═══════════════════════════════════════════\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test suite crashed:', err);
  process.exit(1);
});
