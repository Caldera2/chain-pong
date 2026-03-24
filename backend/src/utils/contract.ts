// ─────────────────────────────────────────────────────────
// ChainPongStaking Contract — ABI & Helper
// ─────────────────────────────────────────────────────────

import { ethers } from 'ethers';
import { env } from '../config/env';
import { getProvider } from './wallet';

// Minimal ABI — only the functions we call from the backend
export const STAKING_ABI = [
  // Player actions
  'function createMatch(bytes32 matchId) external payable',
  'function joinMatch(bytes32 matchId) external payable',
  'function cancelMatch(bytes32 matchId) external',

  // Resolver actions (backend)
  'function settleMatch(bytes32 matchId, address _winner) external',
  'function disputeMatch(bytes32 matchId) external',

  // View functions
  'function getMatch(bytes32 matchId) external view returns (tuple(bytes32 id, address player1, address player2, uint256 stakeAmount, uint8 state, address winner, uint256 createdAt, uint256 settledAt))',
  'function getContractBalance() external view returns (uint256)',
  'function isValidStake(uint256 amount) external view returns (bool)',
  'function validStakes(uint256) external view returns (bool)',
  'function paused() external view returns (bool)',

  // Events
  'event MatchCreated(bytes32 indexed matchId, address indexed player1, uint256 stakeAmount)',
  'event MatchJoined(bytes32 indexed matchId, address indexed player2)',
  'event MatchSettled(bytes32 indexed matchId, address indexed winner, uint256 payout, uint256 fee)',
  'event MatchCancelled(bytes32 indexed matchId, address indexed player)',
];

/**
 * Get the staking contract instance.
 * Returns null if STAKING_CONTRACT_ADDRESS is not configured.
 */
export function getStakingContract(signerOrProvider?: ethers.Signer | ethers.Provider): ethers.Contract | null {
  const address = env.STAKING_CONTRACT_ADDRESS;
  if (!address) return null;

  return new ethers.Contract(
    address,
    STAKING_ABI,
    signerOrProvider || getProvider()
  );
}

/**
 * Check if the staking contract is configured and available.
 */
export function isContractConfigured(): boolean {
  return !!env.STAKING_CONTRACT_ADDRESS;
}

/**
 * Convert a UUID match ID to bytes32 for on-chain use.
 * Uses keccak256 hash of the UUID string.
 */
export function matchIdToBytes32(matchId: string): string {
  return ethers.id(matchId); // keccak256 of the string
}

/**
 * Check if the contract is paused.
 */
export async function isContractPaused(): Promise<boolean> {
  const contract = getStakingContract();
  if (!contract) return true; // if no contract, treat as paused
  try {
    return await contract.paused();
  } catch {
    return true;
  }
}
