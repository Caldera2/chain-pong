'use client';

/**
 * Frontend hooks for interacting with ChainPongEscrow contract.
 *
 * Handles:
 * - createMatch: player stakes ETH → contract
 * - joinMatch: opponent stakes ETH → contract
 * - buyPerk: purchase board → 100% to dev earnings
 * - useMatchStatus: listens for contract events (MatchCreated, MatchReady, MatchSettled)
 *
 * All write operations wait for tx receipt before updating UI.
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

// Contract address — set via env var after deployment
const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;

export const isContractDeployed = CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000';

// ─── Helper: Convert string matchId to bytes32 ──────────
export function matchIdToBytes32(matchId: string): Hex {
  return keccak256(
    encodeAbiParameters([{ type: 'string' }], [matchId])
  );
}

// ─── Match Status Types ─────────────────────────────────
type MatchStatus = 'idle' | 'pending' | 'confirmed' | 'error';

interface MatchEvent {
  type: 'created' | 'joined' | 'ready' | 'settled' | 'cancelled' | 'disputed';
  matchId: Hex;
  data: Record<string, unknown>;
}

// ─── useCreateMatch ─────────────────────────────────────
// Player 1 calls createMatch on the contract
export function useCreateMatch() {
  const { writeContractAsync } = useWriteContract();
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

  const createMatch = useCallback(async (matchId: string, stakeEth: number) => {
    setStatus('pending');
    setError(null);
    try {
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'createMatch',
        args: [matchIdToBytes32(matchId)],
        value: parseEther(stakeEth.toString()),
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

  return { createMatch, status, error, txHash, reset };
}

// ─── useJoinMatch ───────────────────────────────────────
// Player 2 calls joinMatch on the contract
export function useJoinMatch() {
  const { writeContractAsync } = useWriteContract();
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

  const joinMatch = useCallback(async (matchId: string, stakeEth: number) => {
    setStatus('pending');
    setError(null);
    try {
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'joinMatch',
        args: [matchIdToBytes32(matchId)],
        value: parseEther(stakeEth.toString()),
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

  return { joinMatch, status, error, txHash, reset };
}

// ─── useBuyPerk ─────────────────────────────────────────
// Purchase a perk/board via the contract
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
// Listens for contract events and dispatches updates
export function useMatchStatus(matchId?: string) {
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isSettled, setIsSettled] = useState(false);

  const matchIdBytes = matchId ? matchIdToBytes32(matchId) : undefined;

  // Listen for MatchReady (both players staked → game can start)
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

  // Listen for MatchSettled (game over → winner paid)
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

// ─── useContractStats ───────────────────────────────────
// Read contract state for dashboard/admin
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
