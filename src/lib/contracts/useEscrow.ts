'use client';

/**
 * Frontend hooks for interacting with ChainPongEscrow contract.
 *
 * NEW: createMatch/joinMatch now require a backend-signed EIP-712 permit.
 * The frontend fetches the permit from the backend, then passes it to
 * the contract. This prevents ghost matches (unauthorized staking).
 *
 * Flow:
 * 1. Frontend calls backend → GET /api/matches/:id/permit
 * 2. Backend signs EIP-712 MatchPermit → returns { signature, deadline }
 * 3. Frontend calls contract.createMatch(matchId, deadline, signature)
 * 4. Contract verifies signature via ECDSA.recover
 */

import { useState, useEffect, useCallback } from 'react';
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useWatchContractEvent,
  useReadContract,
  useAccount,
} from 'wagmi';
import { parseEther, encodeAbiParameters, keccak256, type Hex } from 'viem';
import { ESCROW_ABI } from './escrowAbi';
import { ACTIVE_CHAIN } from '../wagmi';

const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export const isContractDeployed = CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000';

// ─── Helper: Convert string matchId to bytes32 ──────────
export function matchIdToBytes32(matchId: string): Hex {
  return keccak256(
    encodeAbiParameters([{ type: 'string' }], [matchId])
  );
}

// ─── Helper: Fetch match permit from backend ────────────
async function fetchMatchPermit(
  matchId: string,
  playerAddress: string,
  stakeAmountWei: bigint,
  token: string
): Promise<{ signature: Hex; deadline: bigint }> {
  const res = await fetch(`${API_URL}/api/matches/${matchId}/permit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      playerAddress,
      stakeAmountWei: stakeAmountWei.toString(),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to get match permit' }));
    throw new Error(err.error || 'Failed to get match permit');
  }

  const data = await res.json();
  return {
    signature: data.data.signature as Hex,
    deadline: BigInt(data.data.deadline),
  };
}

// ─── Match Status Types ─────────────────────────────────
type MatchStatus = 'idle' | 'pending' | 'confirmed' | 'error';

interface MatchEvent {
  type: 'created' | 'joined' | 'ready' | 'settled' | 'cancelled' | 'disputed';
  matchId: Hex;
  data: Record<string, unknown>;
}

// ─── useCreateMatch ─────────────────────────────────────
// 1. Fetch EIP-712 permit from backend
// 2. Call contract.createMatch(matchId, deadline, permit)
export function useCreateMatch() {
  const { writeContractAsync } = useWriteContract();
  const { address } = useAccount();
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [status, setStatus] = useState<MatchStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const { isSuccess, isError } = useWaitForTransactionReceipt({
    hash: txHash,
    confirmations: 2,
  });

  useEffect(() => {
    if (isSuccess) setStatus('confirmed');
    if (isError) { setStatus('error'); setError('Transaction failed on-chain'); }
  }, [isSuccess, isError]);

  const createMatch = useCallback(async (matchId: string, stakeEth: number, authToken?: string) => {
    if (!address) { setError('Wallet not connected'); return; }
    setStatus('pending');
    setError(null);

    try {
      const stakeWei = parseEther(stakeEth.toString());

      // Fetch EIP-712 permit from backend
      let permitArgs: { deadline: bigint; signature: Hex } | null = null;
      if (authToken) {
        try {
          permitArgs = await fetchMatchPermit(matchId, address, stakeWei, authToken);
        } catch (err: any) {
          console.warn('[ESCROW] Permit fetch failed, proceeding without:', err.message);
        }
      }

      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'createMatch',
        args: [
          matchIdToBytes32(matchId),
          permitArgs?.deadline ?? BigInt(Math.floor(Date.now() / 1000) + 300),
          permitArgs?.signature ?? '0x' as Hex,
        ],
        value: stakeWei,
        chainId: ACTIVE_CHAIN.id,
      });
      setTxHash(hash);
      return hash;
    } catch (err: any) {
      setStatus('error');
      const msg = err?.shortMessage || err?.message || 'Transaction failed';
      setError(msg.includes('User rejected') ? 'Transaction rejected' : msg);
      return undefined;
    }
  }, [writeContractAsync, address]);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setTxHash(undefined);
  }, []);

  return { createMatch, status, error, txHash, reset };
}

// ─── useJoinMatch ───────────────────────────────────────
export function useJoinMatch() {
  const { writeContractAsync } = useWriteContract();
  const { address } = useAccount();
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [status, setStatus] = useState<MatchStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const { isSuccess, isError } = useWaitForTransactionReceipt({
    hash: txHash,
    confirmations: 2,
  });

  useEffect(() => {
    if (isSuccess) setStatus('confirmed');
    if (isError) { setStatus('error'); setError('Transaction failed on-chain'); }
  }, [isSuccess, isError]);

  const joinMatch = useCallback(async (matchId: string, stakeEth: number, authToken?: string) => {
    if (!address) { setError('Wallet not connected'); return; }
    setStatus('pending');
    setError(null);

    try {
      const stakeWei = parseEther(stakeEth.toString());

      let permitArgs: { deadline: bigint; signature: Hex } | null = null;
      if (authToken) {
        try {
          permitArgs = await fetchMatchPermit(matchId, address, stakeWei, authToken);
        } catch (err: any) {
          console.warn('[ESCROW] Permit fetch failed, proceeding without:', err.message);
        }
      }

      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'joinMatch',
        args: [
          matchIdToBytes32(matchId),
          permitArgs?.deadline ?? BigInt(Math.floor(Date.now() / 1000) + 300),
          permitArgs?.signature ?? '0x' as Hex,
        ],
        value: stakeWei,
        chainId: ACTIVE_CHAIN.id,
      });
      setTxHash(hash);
      return hash;
    } catch (err: any) {
      setStatus('error');
      const msg = err?.shortMessage || err?.message || 'Transaction failed';
      setError(msg.includes('User rejected') ? 'Transaction rejected' : msg);
      return undefined;
    }
  }, [writeContractAsync, address]);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setTxHash(undefined);
  }, []);

  return { joinMatch, status, error, txHash, reset };
}

// ─── useBuyPerk ─────────────────────────────────────────
export function useBuyPerk() {
  const { writeContractAsync } = useWriteContract();
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [status, setStatus] = useState<MatchStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const { isSuccess, isError } = useWaitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
  });

  useEffect(() => {
    if (isSuccess) setStatus('confirmed');
    if (isError) { setStatus('error'); setError('Transaction failed on-chain'); }
  }, [isSuccess, isError]);

  const buyPerk = useCallback(async (perkId: number, priceEth: number) => {
    setStatus('pending');
    setError(null);
    try {
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'buyPerk',
        args: [BigInt(perkId)],
        value: parseEther(priceEth.toString()),
        chainId: ACTIVE_CHAIN.id,
      });
      setTxHash(hash);
      return hash;
    } catch (err: any) {
      setStatus('error');
      const msg = err?.shortMessage || err?.message || 'Transaction failed';
      setError(msg.includes('User rejected') ? 'Transaction rejected' : msg);
      return undefined;
    }
  }, [writeContractAsync]);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setTxHash(undefined);
  }, []);

  return { buyPerk, status, error, txHash, reset };
}

// ─── useMatchStatus ─────────────────────────────────────
export function useMatchStatus(matchId?: string) {
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isSettled, setIsSettled] = useState(false);

  const matchIdBytes = matchId ? matchIdToBytes32(matchId) : undefined;

  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: ESCROW_ABI,
    eventName: 'MatchReady',
    onLogs(logs) {
      for (const log of logs) {
        const args = (log as any).args;
        if (matchIdBytes && args?.matchId === matchIdBytes) {
          setIsReady(true);
          setEvents(prev => [...prev, {
            type: 'ready',
            matchId: args.matchId,
            data: { player1: args.player1, player2: args.player2, stakeAmount: args.stakeAmount },
          }]);
        }
      }
    },
    enabled: !!matchIdBytes && isContractDeployed,
  });

  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: ESCROW_ABI,
    eventName: 'MatchSettled',
    onLogs(logs) {
      for (const log of logs) {
        const args = (log as any).args;
        if (matchIdBytes && args?.matchId === matchIdBytes) {
          setIsSettled(true);
          setEvents(prev => [...prev, {
            type: 'settled',
            matchId: args.matchId,
            data: { winner: args.winner, payout: args.payout, fee: args.fee },
          }]);
        }
      }
    },
    enabled: !!matchIdBytes && isContractDeployed,
  });

  return { events, isReady, isSettled };
}

// ─── useClaimWinnings ───────────────────────────────────
export function useClaimWinnings() {
  const { writeContractAsync } = useWriteContract();
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [status, setStatus] = useState<MatchStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const { isSuccess, isError } = useWaitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
  });

  useEffect(() => {
    if (isSuccess) setStatus('confirmed');
    if (isError) { setStatus('error'); setError('Claim transaction failed on-chain'); }
  }, [isSuccess, isError]);

  const claimWinnings = useCallback(async () => {
    setStatus('pending');
    setError(null);
    try {
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'claimWinnings',
        chainId: ACTIVE_CHAIN.id,
      });
      setTxHash(hash);
      return hash;
    } catch (err: any) {
      setStatus('error');
      const msg = err?.shortMessage || err?.message || 'Claim failed';
      setError(msg.includes('User rejected') ? 'Transaction rejected' : msg);
      return undefined;
    }
  }, [writeContractAsync]);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setTxHash(undefined);
  }, []);

  return { claimWinnings, status, error, txHash, reset };
}

// ─── usePlayerClaimInfo ─────────────────────────────────
// Now returns 5 values (added unlockTimestamp for grace period)
export function usePlayerClaimInfo(playerAddress?: `0x${string}`) {
  const { data, refetch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ESCROW_ABI,
    functionName: 'getPlayerClaimInfo',
    args: playerAddress ? [playerAddress] : undefined,
    query: {
      enabled: !!playerAddress && isContractDeployed,
      refetchInterval: 15000,
    },
  });

  const [claimable, unlockTimestamp, totalWon, totalClaimed, matchesPlayed] =
    (data as [bigint, bigint, bigint, bigint, bigint]) || [BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0)];

  const unlockTime = Number(unlockTimestamp) * 1000; // Convert to JS ms
  const isLocked = unlockTime > Date.now();

  return {
    claimable: Number(claimable) / 1e18,
    unlockTime,
    isLocked,
    totalWon: Number(totalWon) / 1e18,
    totalClaimed: Number(totalClaimed) / 1e18,
    matchesPlayed: Number(matchesPlayed),
    refetch,
  };
}

// ─── useContractStats ───────────────────────────────────
export function useContractStats() {
  const { data: totalMatches } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ESCROW_ABI,
    functionName: 'totalMatches',
  });

  const { data: totalVolume } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ESCROW_ABI,
    functionName: 'totalVolume',
  });

  const { data: devEarnings } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ESCROW_ABI,
    functionName: 'totalDeveloperEarnings',
  });

  const { data: totalWithdrawn } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ESCROW_ABI,
    functionName: 'totalWithdrawn',
  });

  const { data: contractBalance } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ESCROW_ABI,
    functionName: 'getContractBalance',
  });

  return {
    totalMatches: totalMatches ? Number(totalMatches) : 0,
    totalVolume: totalVolume ? Number(totalVolume) / 1e18 : 0,
    devEarnings: devEarnings ? Number(devEarnings) / 1e18 : 0,
    totalWithdrawn: totalWithdrawn ? Number(totalWithdrawn) / 1e18 : 0,
    contractBalance: contractBalance ? Number(contractBalance) / 1e18 : 0,
  };
}
