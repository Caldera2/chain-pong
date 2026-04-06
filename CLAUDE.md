# Chain Pong — Project Conventions

## Stack
- **Frontend**: Next.js + React, TypeScript strict mode, Tailwind CSS
- **Backend**: Express + Prisma (PostgreSQL), Socket.IO, ethers.js v6
- **Smart Contract**: Solidity 0.8.24, compiled via solcjs
- **Chain**: Base Sepolia (chainId 84532)

## Coding Style
- Functional components only (no class components)
- Strict TypeScript everywhere — no `any` except for tick log entries
- Use `as const` for ABI exports and config objects
- Prefer `crypto.randomBytes()` over `Math.random()` for anything security-relevant
- Use HMAC-SHA256 for any hash that needs to be verifiable (config hashes, payout tokens)
- All ETH amounts stored as `Decimal` in Prisma, `bigint` on-chain, `number` only in display layers

## File Conventions
- Frontend ABI: `src/lib/contracts/escrowAbi.ts`
- Backend ABI: `backend/src/contracts/escrowAbi.ts`
- Both ABI files MUST stay in sync — update both whenever the contract changes
- Compiled artifacts: `artifacts/` — regenerate with `npx solcjs --abi --bin --include-path node_modules --base-path . contracts/ChainPongEscrow.sol -o artifacts/`
- Tests: `tests/` directory at project root

## Security Principles
- Never trust client-submitted values for money — always re-derive from confirmed DB transactions
- Every on-chain action requires an EIP-712 signature from the resolver
- EIP-712 deadlines use `provider.getBlock('latest').timestamp`, NOT `Date.now()`
- Match IDs for on-chain use are CSPRNG `crypto.randomBytes(32)`, not DB cuid
- All payout claims use an atomic database mutex (conditional UPDATE WHERE payoutTxHash IS NULL)
- Socket game events are pinned to registered socket IDs — third-party sockets are disconnected

## Commit Style
- Imperative mood, under 72 chars for title
- Body explains the "why" (security threat mitigated, not just what changed)
- Always include `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

## Build & Verify
- Frontend build: `npm run build` (from project root)
- Backend type-check: `npx tsc --noEmit` (from `backend/`)
- Contract compile: `npx solcjs --abi --bin ...` (see above)
- After any contract change: regenerate ABI, update both escrowAbi.ts files, rebuild both
