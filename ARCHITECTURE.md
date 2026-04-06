# Chain Pong - Architecture & Security Overview

---

## 1. Overview

Chain Pong is a crypto-staked 1v1 Pong game deployed on Base Sepolia where players wager real ETH on skill-based matches, with every stake, payout, and dispute handled by a trustless on-chain escrow contract. Unlike typical Web3 games that bolt a token onto a centralized backend, Chain Pong's architecture treats the blockchain as its financial core and the server as a cryptographically accountable referee — every action is either on-chain, EIP-712 signed, or HMAC-verified. The result is a game where neither the players, the frontend, nor even a compromised admin key can steal funds without triggering provable, on-chain circuit breakers.

---

## 2. The Player Experience

### Connect
Players connect via **RainbowKit v2** (MetaMask, WalletConnect, or any EIP-1193 wallet) or sign up with email/password. Email users receive a **custodial game wallet** — a server-generated Ethereum keypair with an encrypted private key stored in the database — so they can play without ever installing a browser extension.

### Matchmake & Stake
From the lobby, a player selects a stake tier (0.001 to 0.05 ETH), picks a board skin, and taps **Find an Opponent**. The backend's ELO-proximity matchmaking queue pairs them within seconds. Both players' stakes are locked in a database transaction and transferred on-chain to the treasury. If the backend is unreachable, the frontend gracefully falls back to a local AI match — no error screen, no dead end.

### Play
The game runs on an **HTML5 Canvas at 60fps** with deterministic physics seeded by a server-generated `matchSeed`. Both clients derive identical ball trajectories from the same seed using HMAC-SHA256, so the server can mathematically verify every tick of gameplay after the fact. Players can activate purchased **perks** (cosmetic board skins) mid-match.

### Win & Claim
When a match ends, the backend:
1. Validates the submitted scores against the tick log (anti-cheat).
2. Declares a winner and credits their `claimableBalance` on the smart contract.
3. A **1-hour grace period** locks the winnings — giving the admin time to review and dispute suspicious results before the winner can withdraw.

The winner claims their ETH through `claimWinnings()` on the escrow contract after the grace period expires.

---

## 3. Frontend Architecture

### Stack
- **Next.js + React** with TypeScript
- **Zustand** for state management (`currentMatchId`, `currentMatchSeed`, `currentConfigHash`, game balance, ELO)
- **wagmi + viem** for typed contract interactions
- **RainbowKit v2** for wallet connection UX

### Dynamic Timeouts
The API layer uses `AbortController` with route-aware timeouts:
- **10 seconds** for fast operations (auth, profile, matchmaking)
- **45 seconds** for blockchain operations (deposits, withdrawals, balance sync, settlement)

This prevents a slow on-chain confirmation from being killed by a generic timeout, while still failing fast on routes that should respond instantly.

### Client-Side Config Verification
Before every match, the frontend computes an **HMAC-SHA256 hash** of its local `OFFICIAL_GAME_CONFIG` (canvas dimensions, paddle size, ball speed, win score) using the server-provided `matchSeed` as the key. It compares this against the `configHash` sent by the backend. If they differ — meaning someone modified game constants via DevTools — the game refuses to start. This makes client-side physics tampering detectable before a single frame is rendered.

### JWT Pre-Flight
`ensureValidToken()` decodes the JWT's `exp` claim before every API call and socket connection. If the token expires within 60 seconds, it silently refreshes. This eliminates "Session expired" errors during gameplay and prevents wasted blockchain transactions from expired auth.

---

## 4. Backend & Real-Time Infrastructure

### Stack
- **Express** REST API with Prisma ORM (PostgreSQL)
- **Socket.IO** for real-time matchmaking and in-game events
- **ethers.js v6** for all blockchain interactions
- **Alchemy Notify** webhooks for instant deposit detection

### Server-Seeded Deterministic Physics
Every match starts with a `matchSeed` generated via `crypto.randomBytes(16)`. The seed determines the ball's initial trajectory through HMAC-SHA256 derivation:
```
HMAC-SHA256(seed, "ball-spawn-0") → byte[0] determines VX direction, byte[1] determines VY direction
```
Both the server and client use the identical algorithm. When the client submits its tick log, the server verifies that the first tick's ball velocity matches the seed-derived values — catching any client that fabricated or replayed game data.

### Anti-Cheat Tick Validation
The `validateTickPhysics()` engine performs six layers of verification on every submitted tick log:

1. **Tick Rate Ceiling** — The total ticks cannot exceed `serverDuration * 2 ticks/sec * 1.10`. A match that lasted 30 seconds on the server clock can produce at most ~66 ticks. A lag-switch dumping 500 queued ticks or a speedhacked client running at 120fps is caught immediately.
2. **Seed Trajectory Match** — First tick's ball velocity must match the HMAC-derived spawn direction.
3. **Minimum Tick Count** — At least 3 ticks per point scored (you can't score 7 points in 5 ticks).
4. **Duration Bounds** — Game must last between 15 seconds and 10 minutes.
5. **Physics Plausibility** — Paddle teleportation detection, ball bounds checking, monotonic time enforcement, and score-only-increases validation.
6. **Warning Accumulation** — 5+ physics anomalies in a single log = automatic rejection.

PvP matches that fail validation are moved to `DISPUTED` status. PvE failures are logged but allowed (no money at stake).

### Socket-Session Pinning
When a match goes active, the backend maps `matchId -> [socketId_P1, socketId_P2]`. Every game event (`game:paddle`, `game:perk`, `game:ready`) is validated against this map via `validateMatchSocket()`. If a third-party socket — even one authenticated with a valid JWT — attempts to send events for a match it's not registered in, it receives a `security_alert` and is **immediately disconnected**. This prevents:
- A second browser tab sniffing opponent paddle positions
- A stolen JWT being used to inject spoofed move events
- Session replay attacks from a different IP

### Replace-By-Fee (RBF) Payout Engine
When a payout transaction hasn't confirmed within 2 minutes, the `waitWithRBF()` function:
1. Reads current network fee data
2. Bumps `maxFeePerGas` and `maxPriorityFeePerGas` by 50%
3. Resubmits the transaction with the same nonce (EIP-1559 replacement)
4. Repeats up to 2 times

This prevents payouts from getting stuck during gas spikes on Base — the transaction either confirms at normal speed or automatically escalates its priority.

### Atomic Claim Mutex
The `claimPayout()` function uses a database-level mutex to prevent burst-claim race conditions:
```sql
UPDATE match SET payoutTxHash = 'CLAIMING'
WHERE id = ? AND status = 'COMPLETED' AND winnerId = ? AND payoutTxHash IS NULL
```
Only the first of N concurrent requests matches this condition. All others get `count = 0` and abort before touching the blockchain. The sentinel value is replaced with the real `txHash` on success or released on failure.

---

## 5. Smart Contract & Economy

### ChainPongEscrow.sol (Solidity 0.8.24)

The contract is the financial backbone — it holds all staked ETH and enforces the rules of the economy. The backend never touches player funds directly; all money flows through the escrow.

### Flow of Funds
```
Player1 stakes 0.01 ETH ──→ createMatch() ──→ Contract holds 0.01 ETH
Player2 stakes 0.01 ETH ──→ joinMatch()   ──→ Contract holds 0.02 ETH (pot)
                                                    │
                               settleMatch() ◄──────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
           Winner's claimableBalance          Developer earnings
           += 0.0192 ETH (96%)               += 0.0008 ETH (4%)
                    │                               │
                    ▼                               ▼
           claimWinnings()                  withdrawEarnings()
           (after 1-hour grace)             (pull-based, owner only)
```

### 4% Protocol Fee
On every settled match, 4% of the total pot (both stakes combined) is credited to `totalDeveloperEarnings`. The remaining 96% goes to the winner's `claimableBalance`. The fee is configurable via `setProtocolFee()` (capped at 10% max).

### EIP-712 Permit System
Every `createMatch` and `joinMatch` call requires a **resolver-signed EIP-712 permit**. The backend signs typed data containing `(matchId, player, stakeAmount, deadline)` using the admin wallet. The contract verifies:
1. The signature was produced by the designated `resolver` address
2. The `deadline` hasn't passed
3. The permit hasn't been used before (`usedPermits[digest]`)
4. `msg.sender == player` (anti-MEV front-running)

Settlement uses a separate `SettleProof` struct: `(matchId, winner, player1Score, player2Score, deadline)`.

### RPC-Based Deadline Syncing
Deadlines are calculated using `provider.getBlock('latest').timestamp + 900 seconds` instead of `Date.now()`. This synchronizes the backend with the L2 sequencer's clock, preventing "Permit expired" rejections caused by clock drift between the server and Base's block production.

### Stake Tiers
Six pre-approved tiers: 0.001, 0.002, 0.005, 0.01, 0.02, 0.05 ETH. The contract maintains a `validStakes` mapping and rejects any amount not in the list. Admin can add/remove tiers via `setStakeTier()`.

### Claim Grace Period
After settlement, winnings are locked for **1 hour** (`CLAIM_GRACE_PERIOD`). During this window, the admin can dispute the result via `adminDisputeMatch()`, which claws back the credited balance and moves the match to `Disputed` for manual review. After the grace period, the winner calls `claimWinnings()` to withdraw.

---

## 6. The "Defense-in-Depth" Security Model

Chain Pong implements **13 distinct security mechanisms** across four layers (frontend, backend, real-time, and on-chain). Each fix targets a specific, named attack vector:

### On-Chain Defenses

- **Dispute Circuit Breaker** — `adminDisputeMatch()` is rate-limited to 5 disputes per 1-hour sliding window. If exceeded, `disputeCircuitBroken` trips and all admin disputes halt until manually reset. This limits damage from a compromised admin private key — an attacker cannot mass-dispute every settled match and claw back all winners' balances in a single attack.

- **CSPRNG matchId + matchIdUsed Mapping** — Match IDs are generated via `crypto.randomBytes(32)` (256-bit, cryptographically random). The contract maintains `mapping(bytes32 => bool) public matchIdUsed` and marks every ID as permanently used on creation — even after cancellation or dispute. Combined with `usedPermits[digest]`, this makes ghost signature replay attacks impossible: you cannot reuse a permit from a settled/cancelled match on a new match ID.

- **Permit Front-Running Protection** — `_verifyMatchPermit()` enforces `require(msg.sender == player)` as its first check. Even though the EIP-712 hash already includes the player address, this explicit guard ensures that if Base decentralizes its sequencer and the mempool becomes public, an MEV bot cannot copy permit calldata from a pending transaction and submit it from their own address with higher gas.

- **EIP-712 Domain Separation** — The domain separator includes `chainId` and `verifyingContract`, with automatic recomputation on fork. Permits signed for Base Sepolia cannot be replayed on Base Mainnet or a forked chain.

### Backend Defenses

- **Tick Rate Ceiling** — Server-measured wall-clock duration caps the maximum tick count at `duration * 2 ticks/sec * 1.10`. Catches lag-switch packet dumps and speedhacked clients.

- **Atomic Claim Mutex** — Database-level conditional `UPDATE ... WHERE payoutTxHash IS NULL` prevents burst-claim race conditions. 50 concurrent requests = 1 payout, not 50.

- **RPC-Synced Deadlines** — EIP-712 deadlines use `block.timestamp` from the RPC provider, not `Date.now()`. Eliminates clock-drift signature rejections on L2.

- **Replace-By-Fee Engine** — Stuck payout transactions are automatically resubmitted with 50% higher gas after 2 minutes, up to 2 retries.

- **Dust Spam Protection** — Deposits below 0.001 ETH (via both `syncDeposits()` and Alchemy webhooks) are silently discarded. Prevents an attacker from bloating the Transaction table with thousands of micro-transfers.

### Real-Time Defenses

- **Socket-Session Pinning** — Game events are bound to the two specific socket IDs that started the match. Third-party sockets are disconnected on sight with a `security_alert`.

- **JWT Per-Event Validation** — `socket.use()` middleware re-verifies the JWT on every inbound event, not just the initial handshake. Expired tokens trigger `auth_error` for silent refresh.

### Frontend Defenses

- **HMAC-SHA256 Config Verification** — Client computes a hash of its game constants using the match seed and compares against the server's hash. Any DevTools modification is detected before the game starts.

- **JWT Pre-Flight with Expiry Decode** — `ensureValidToken()` reads the JWT `exp` claim and proactively refreshes within a 60-second buffer, eliminating mid-game auth failures.

---

### Security Summary Table

| # | Vulnerability | Layer | Mitigation |
|---|---|---|---|
| 1 | Expired token API calls | Frontend | JWT pre-flight with exp decode |
| 2 | Stuck blockchain payouts | Backend | RBF engine (50% gas bump, 2 retries) |
| 3 | Blockchain ops killed by timeout | Frontend | Dynamic 10s/45s route-aware timeouts |
| 4 | L2 clock-drift signature rejection | Backend | RPC block.timestamp deadlines |
| 5 | DevTools physics tampering | Frontend + Backend | HMAC-SHA256 config hash verification |
| 6 | Dust transaction DoS | Backend + Webhook | 0.001 ETH minimum deposit threshold |
| 7 | Admin key compromise mass clawback | Smart Contract | Dispute circuit breaker (5/hour) |
| 8 | Socket hijacking / paddle sniffing | Backend | Socket-session pinning |
| 9 | Ghost signature replay | Backend + Contract | CSPRNG matchId + matchIdUsed mapping |
| 10 | MEV permit front-running | Smart Contract | msg.sender == player enforcement |
| 11 | Lag switch / speedhack | Backend | Tick rate ceiling (server wall-clock) |
| 12 | Burst-claim treasury drain | Backend | Atomic DB mutex (conditional UPDATE) |
| 13 | Mid-session token expiry | Backend | Per-event JWT re-validation via socket.use() |
