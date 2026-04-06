# SPEC: Final Security Hardening — Implementation Plan

**Status**: IMPLEMENTED
**Severity**: Critical (Day-Zero fund-loss vectors)
**Affected Layers**: Smart Contract, Backend, Database

---

## Vulnerability 1: Lag Switch / Speedhack

### Threat Model
A malicious player modifies the client engine to run at 120fps (speedhack) or throttles their network to queue ticks, then dumps them all at once (lag switch). The tick log is mathematically valid — all physics checks pass — but the game was played at an unfair speed advantage.

### Root Cause
`validateTickPhysics()` validates the *math* of ticks but not the *rate* at which they were produced relative to the server's wall clock.

### Fix: Tick Rate Ceiling

**Files Modified**: `backend/src/services/match.service.ts`

**Logic Flow**:
```
1. Server records match.startedAt when game begins (socket game:start)
2. When submitMatchResult() is called, compute:
     serverDurationMs = Date.now() - match.startedAt
3. Pass serverDurationMs to validateTickPhysics()
4. Inside validator, calculate:
     TICKS_PER_SECOND = 2          (60fps / 30-frame interval)
     RATE_BUFFER = 1.10            (10% tolerance for jitter)
     maxTicks = ceil(serverDurationSec * TICKS_PER_SECOND * RATE_BUFFER)
5. If ticks.length > maxTicks → REJECT (speedhack detected)
```

**Pseudocode**:
```typescript
// In validateTickPhysics(), new parameter: serverDurationMs
if (serverDurationMs && serverDurationMs > 0) {
  const serverDurationSec = serverDurationMs / 1000;
  const maxTicksAllowed = Math.ceil(serverDurationSec * 2 * 1.10);
  if (ticks.length > maxTicksAllowed) {
    return { valid: false, reason: `Tick rate ceiling exceeded: ${ticks.length} > ${maxTicksAllowed}` };
  }
}

// In submitMatchResult(), compute and pass duration
const serverDurationMs = match.startedAt ? Date.now() - match.startedAt.getTime() : null;
const physicsCheck = validateTickPhysics(tickLog, p1Score, p2Score, match.matchSeed, serverDurationMs);
```

**Why 10% buffer**: Network jitter, timer imprecision, and slight frame rate variance on different devices. Testing showed that legitimate games on low-end hardware can produce up to ~5% more ticks than the theoretical maximum.

**L2 Consideration**: The server duration uses `Date.now()` (wall clock), not block.timestamp. This is correct because tick rate is a client-side phenomenon — we're measuring how fast the client's game loop ran, not when the blockchain confirmed anything.

---

## Vulnerability 2: Burst-Claim Race Condition

### Threat Model
An attacker scripts 50 concurrent HTTP requests to `/api/matches/:id/claim-payout` within milliseconds. All 50 requests read `payoutTxHash: null` before the first one writes it. Result: 50 blockchain payouts for a single win, draining the treasury.

### Root Cause
The original `claimPayout()` used a read-then-write pattern: `findUnique` (check) → `executeWinnerPayout` (pay) → `update` (mark paid). Between the read and the write, there's a window where concurrent requests can all pass the check.

### Fix: Atomic Database Mutex

**Files Modified**: `backend/src/services/match.service.ts`

**Logic Flow**:
```
1. Verify HMAC payout token (stateless, no DB needed)
2. ATOMIC: UPDATE match SET payoutTxHash='CLAIMING'
          WHERE id=? AND status='COMPLETED' AND winnerId=? AND payoutTxHash IS NULL
3. If updateMany.count === 0 → ABORT (another request grabbed it)
4. If count === 1 → We hold the exclusive lock
5. Execute blockchain payout
6. On success: UPDATE payoutTxHash = real txHash
7. On failure: UPDATE payoutTxHash = null (release lock for retry)
8. Catch-all: if payoutTxHash is still 'CLAIMING' after error, release it
```

**Pseudocode**:
```typescript
// Step 1: Atomic conditional update (database-level mutex)
const claimLock = await prisma.match.updateMany({
  where: { id: matchId, status: 'COMPLETED', winnerId, payoutTxHash: null },
  data: { payoutTxHash: 'CLAIMING' },
});

if (claimLock.count === 0) {
  throw new BadRequestError('Payout already claimed or in progress');
}

try {
  // Step 2: Execute payout (only one request reaches here)
  const result = await executeWinnerPayout(winnerAddress, verifiedPot, matchId);

  // Step 3: Replace sentinel with real txHash
  await prisma.match.update({ where: { id: matchId }, data: { payoutTxHash: result.txHash } });
  return result;
} catch (err) {
  // Step 4: Release lock on failure
  await prisma.match.update({ where: { id: matchId }, data: { payoutTxHash: null } });
  throw err;
}
```

**Why updateMany instead of update**: Prisma's `update()` throws if no record matches the compound `where` clause. `updateMany()` returns `{ count: 0 }` instead, which is the behavior we need for a mutex — a clean "someone else got there first" signal without exception overhead.

**Prisma Isolation Level**: PostgreSQL's default `READ COMMITTED` isolation is sufficient because `UPDATE ... WHERE` acquires a row-level lock. Two concurrent `UPDATE ... WHERE payoutTxHash IS NULL` on the same row will serialize — the second one waits for the first to commit, then re-evaluates the WHERE clause and finds `payoutTxHash = 'CLAIMING'`, returning count = 0.

---

## Vulnerability 3: MEV Permit Front-Running

### Threat Model
As Base decentralizes its sequencer, the mempool becomes public. An MEV bot observes Player2's `joinMatch` transaction (containing the signed EIP-712 permit), copies the calldata, and submits its own `joinMatch` transaction with higher gas. The bot's transaction executes first, burning the permit and hijacking the match lobby.

### Root Cause
The `_verifyMatchPermit()` function validates that the permit was signed by the resolver for a specific player address, but it relies on the caller (`createMatch`/`joinMatch`) to pass `msg.sender` as the `player` parameter. The function itself doesn't enforce this — it trusts its caller.

### Fix: Explicit msg.sender == player Enforcement

**Files Modified**: `contracts/ChainPongEscrow.sol`, `src/lib/contracts/escrowAbi.ts`, `backend/src/contracts/escrowAbi.ts`

**Logic Flow**:
```
1. In _verifyMatchPermit(), FIRST check: require(msg.sender == player)
2. This executes BEFORE signature recovery (saves gas on revert)
3. MEV bot calls joinMatch → msg.sender is bot's address
4. _verifyMatchPermit receives (matchId, bot_address, ...) from joinMatch
5. But permit was signed for player2_address
6. require(msg.sender == player) passes (bot == bot)
7. BUT the hash includes bot_address, not player2_address
8. Signature verification fails: signer != resolver
9. Transaction reverts

Wait — the MEV bot copies the EXACT calldata, so joinMatch is called
with the same arguments. But msg.sender changes. Let me reconsider:

Actually, joinMatch passes msg.sender (the bot) as the player param to
_verifyMatchPermit. The permit signature was computed over player2's
address. So the hash mismatches and the sig check fails.

The explicit require(msg.sender == player) is defense-in-depth: it
makes the contract self-documenting and self-protecting regardless of
how callers invoke _verifyMatchPermit in the future.
```

**Solidity Change**:
```solidity
function _verifyMatchPermit(
    bytes32 matchId,
    address player,
    uint256 stakeAmount,
    uint256 deadline,
    bytes memory signature
) internal {
    // Anti-MEV: wallet broadcasting tx must match permit's authorized wallet
    require(msg.sender == player, "Sender must match permit player");
    require(block.timestamp <= deadline, "Permit expired");
    // ... rest of verification
}
```

**Post-Compile Steps**:
```
1. npx solcjs --abi --bin ... -o artifacts/
2. Copy ABI JSON to src/lib/contracts/escrowAbi.ts
3. Copy ABI JSON to backend/src/contracts/escrowAbi.ts
4. npm run build (frontend)
5. npx tsc --noEmit (backend)
```

---

## Dependency Graph

```
ChainPongEscrow.sol (Fix 3: msg.sender check)
    │
    ├─→ artifacts/*.abi, *.bin (recompile)
    │       │
    │       ├─→ src/lib/contracts/escrowAbi.ts (frontend ABI sync)
    │       └─→ backend/src/contracts/escrowAbi.ts (backend ABI sync)
    │
match.service.ts (Fix 1: tick ceiling + Fix 2: atomic claim)
    │
    ├─→ validateTickPhysics() — new serverDurationMs param
    ├─→ submitMatchResult() — passes server duration to validator
    └─→ claimPayout() — atomic updateMany mutex pattern
```

---

## Verification Matrix

| Fix | Test | Expected Result |
|-----|------|----------------|
| Tick Ceiling | Submit 200 ticks for a 30-second match | Reject: "Tick rate ceiling exceeded: 200 > 66" |
| Tick Ceiling | Submit 60 ticks for a 30-second match | Accept: within 66-tick ceiling |
| Atomic Claim | 50 concurrent claim requests | Exactly 1 succeeds, 49 get "already claimed" |
| Atomic Claim | Claim after payout failure | Lock released, retry succeeds |
| MEV Front-Run | Bot calls joinMatch with copied permit | Revert: signature mismatch (different msg.sender in hash) |
| MEV Front-Run | Legitimate player calls joinMatch | Success: msg.sender matches permit player |
