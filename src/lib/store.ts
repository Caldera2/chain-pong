import { create } from 'zustand';

export interface Board {
  id: string;
  name: string;
  price: number;
  color: string;
  gradient: string;
  perk: string;
  perkDescription: string;
  perkIcon: string;
  owned: boolean;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

export interface LeaderboardEntry {
  rank: number;
  address: string;
  username: string;
  wins: number;
  losses: number;
  earnings: number;
  avatar: string;
}

export interface MatchResult {
  playerScore: number;
  opponentScore: number;
  opponentName: string;
  earned: number;
  perkUsed: string;
}

interface GameStore {
  // Wallet
  isConnected: boolean;
  address: string | null;
  balance: number;
  walletBalance: number;
  setConnected: (connected: boolean, address?: string) => void;
  setBalance: (balance: number) => void;
  setWalletBalance: (balance: number) => void;

  // Player
  username: string;
  setUsername: (name: string) => void;
  selectedBoard: string;
  setSelectedBoard: (id: string) => void;

  // Boards
  boards: Board[];
  buyBoard: (id: string) => void;

  // Game State
  screen: 'splash' | 'lobby' | 'mode-select' | 'matchmaking' | 'game' | 'result' | 'leaderboard' | 'shop' | 'profile' | 'withdraw';
  setScreen: (screen: GameStore['screen']) => void;
  gameMode: 'pvp' | 'computer' | null;
  setGameMode: (mode: 'pvp' | 'computer') => void;
  difficulty: 'easy' | 'medium' | 'hard';
  setDifficulty: (d: GameStore['difficulty']) => void;

  // Stats
  wins: number;
  losses: number;
  gamesPlayed: number;
  totalEarnings: number;
  addWin: (earnings: number) => void;
  addLoss: () => void;

  // Perk tracking - perks used per board persist across games
  usedPerks: Record<string, boolean>;
  markPerkUsed: (boardId: string) => void;
  isPerkAvailable: (boardId: string) => boolean;
  resetPerk: (boardId: string) => void;

  // Leaderboard
  leaderboard: LeaderboardEntry[];
}

const BOARDS: Board[] = [
  {
    id: 'classic',
    name: 'Classic',
    price: 0,
    color: '#00d4ff',
    gradient: 'from-cyan-500 to-blue-500',
    perk: 'None',
    perkDescription: 'The OG board. No perks, pure skill.',
    perkIcon: '🏓',
    owned: true,
    rarity: 'common',
  },
  {
    id: 'inferno',
    name: 'Inferno',
    price: 0.005,
    color: '#f97316',
    gradient: 'from-orange-500 to-red-600',
    perk: 'Fireball',
    perkDescription: 'Ball speeds up 20% after 5 hits',
    perkIcon: '🔥',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'frost',
    name: 'Frost Byte',
    price: 0.008,
    color: '#38bdf8',
    gradient: 'from-sky-400 to-cyan-300',
    perk: 'Freeze',
    perkDescription: 'Slow opponent paddle by 30% for 3s once per game',
    perkIcon: '❄️',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'phantom',
    name: 'Phantom',
    price: 0.012,
    color: '#a855f7',
    gradient: 'from-purple-500 to-violet-600',
    perk: 'Invisibility',
    perkDescription: 'Ball becomes invisible for 1s once per game',
    perkIcon: '👻',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'thunder',
    name: 'Thunder Strike',
    price: 0.015,
    color: '#eab308',
    gradient: 'from-yellow-500 to-amber-500',
    perk: 'Lightning',
    perkDescription: 'Paddle grows 40% wider for 3s once per game',
    perkIcon: '⚡',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'void',
    name: 'Void Walker',
    price: 0.025,
    color: '#ec4899',
    gradient: 'from-pink-500 to-rose-600',
    perk: 'Teleport',
    perkDescription: 'Ball teleports to a random position once per game',
    perkIcon: '🌀',
    owned: false,
    rarity: 'legendary',
  },
  {
    id: 'matrix',
    name: 'The Matrix',
    price: 0.03,
    color: '#22c55e',
    gradient: 'from-green-500 to-emerald-500',
    perk: 'Slow-Mo',
    perkDescription: 'Everything slows to 50% speed for 3s once per game',
    perkIcon: '🟢',
    owned: false,
    rarity: 'legendary',
  },
  {
    id: 'galaxy',
    name: 'Galaxy',
    price: 0.05,
    color: '#8b5cf6',
    gradient: 'from-indigo-500 via-purple-500 to-pink-500',
    perk: 'Gravity Well',
    perkDescription: 'Ball curves toward opponent\'s side for 3s',
    perkIcon: '🌌',
    owned: false,
    rarity: 'legendary',
  },
];

const LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, address: '0x1a2b...3c4d', username: 'PongMaster', wins: 342, losses: 28, earnings: 12.5, avatar: '👑' },
  { rank: 2, address: '0x5e6f...7g8h', username: 'BaseChamp', wins: 298, losses: 45, earnings: 9.8, avatar: '🎯' },
  { rank: 3, address: '0x9i0j...1k2l', username: 'NeonSlayer', wins: 256, losses: 52, earnings: 8.2, avatar: '⚡' },
  { rank: 4, address: '0x3m4n...5o6p', username: 'CryptoPaddle', wins: 234, losses: 61, earnings: 7.1, avatar: '🏓' },
  { rank: 5, address: '0x7q8r...9s0t', username: 'VoidPlayer', wins: 212, losses: 78, earnings: 6.4, avatar: '🌀' },
  { rank: 6, address: '0xa1b2...c3d4', username: 'ChainBreaker', wins: 198, losses: 82, earnings: 5.9, avatar: '🔗' },
  { rank: 7, address: '0xe5f6...g7h8', username: 'PixelKing', wins: 176, losses: 91, earnings: 5.1, avatar: '🤴' },
  { rank: 8, address: '0xi9j0...k1l2', username: 'BaseRunner', wins: 165, losses: 95, earnings: 4.7, avatar: '🏃' },
  { rank: 9, address: '0xm3n4...o5p6', username: 'PaddlePro', wins: 152, losses: 103, earnings: 4.2, avatar: '💎' },
  { rank: 10, address: '0xq7r8...s9t0', username: 'GameFi_OG', wins: 141, losses: 110, earnings: 3.8, avatar: '🎮' },
];

// Load persisted stats from localStorage
function loadStats() {
  if (typeof window === 'undefined') return { wins: 0, losses: 0, gamesPlayed: 0, totalEarnings: 0, usedPerks: {} };
  try {
    const saved = localStorage.getItem('chainpong-stats');
    if (saved) return JSON.parse(saved);
  } catch {}
  return { wins: 0, losses: 0, gamesPlayed: 0, totalEarnings: 0, usedPerks: {} };
}

function saveStats(state: { wins: number; losses: number; gamesPlayed: number; totalEarnings: number; usedPerks: Record<string, boolean> }) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('chainpong-stats', JSON.stringify({
      wins: state.wins,
      losses: state.losses,
      gamesPlayed: state.gamesPlayed,
      totalEarnings: state.totalEarnings,
      usedPerks: state.usedPerks,
    }));
  } catch {}
}

const initialStats = loadStats();

export const useGameStore = create<GameStore>((set, get) => ({
  isConnected: false,
  address: null,
  balance: 0,
  walletBalance: 0,
  setConnected: (connected, address) => set({ isConnected: connected, address: address || null }),
  setBalance: (balance) => set({ balance }),
  setWalletBalance: (walletBalance) => set({ walletBalance }),

  username: 'Player',
  setUsername: (username) => set({ username }),
  selectedBoard: 'classic',
  setSelectedBoard: (id) => set({ selectedBoard: id }),

  boards: BOARDS,
  buyBoard: (id) =>
    set((state) => ({
      boards: state.boards.map((b) => (b.id === id ? { ...b, owned: true } : b)),
      balance: state.balance - (state.boards.find((b) => b.id === id)?.price || 0),
    })),

  screen: 'splash',
  setScreen: (screen) => set({ screen }),
  gameMode: null,
  setGameMode: (gameMode) => set({ gameMode }),
  difficulty: 'medium',
  setDifficulty: (difficulty) => set({ difficulty }),

  wins: initialStats.wins,
  losses: initialStats.losses,
  gamesPlayed: initialStats.gamesPlayed,
  totalEarnings: initialStats.totalEarnings,
  addWin: (earnings) =>
    set((state) => {
      const updated = {
        wins: state.wins + 1,
        losses: state.losses,
        gamesPlayed: state.gamesPlayed + 1,
        totalEarnings: state.totalEarnings + earnings,
        balance: state.balance + earnings,
        usedPerks: state.usedPerks,
      };
      saveStats(updated);
      return updated;
    }),
  addLoss: () =>
    set((state) => {
      const updated = {
        wins: state.wins,
        losses: state.losses + 1,
        gamesPlayed: state.gamesPlayed + 1,
        totalEarnings: state.totalEarnings,
        usedPerks: state.usedPerks,
      };
      saveStats(updated);
      return { losses: updated.losses, gamesPlayed: updated.gamesPlayed };
    }),

  // Perk tracking - persists across games
  usedPerks: initialStats.usedPerks || {},
  markPerkUsed: (boardId) =>
    set((state) => {
      const usedPerks = { ...state.usedPerks, [boardId]: true };
      saveStats({ ...state, usedPerks });
      return { usedPerks };
    }),
  isPerkAvailable: (boardId) => !get().usedPerks[boardId],
  resetPerk: (boardId) =>
    set((state) => {
      const usedPerks = { ...state.usedPerks };
      delete usedPerks[boardId];
      saveStats({ ...state, usedPerks });
      return { usedPerks };
    }),

  leaderboard: LEADERBOARD,
}));
