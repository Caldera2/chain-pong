import { create } from 'zustand';
import {
  apiSignup,
  apiLogin,
  apiLogout,
  apiGetProfile,
  apiGetLeaderboard,
  apiGetTopPlayers,
  apiSubmitResult,
  apiCreateMatch,
  apiPurchaseBoard,
  clearTokens,
  getAccessToken,
  type LeaderboardEntry as ApiLeaderboardEntry,
} from './api';
import { disconnectSocket } from './socket';

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
  joinedAt: number; // timestamp — earlier = higher rank on ties
  isPlayer?: boolean;
}

export interface MatchResult {
  playerScore: number;
  opponentScore: number;
  opponentName: string;
  earned: number;
  perkUsed: string;
}

export type AuthMethod = 'email' | 'wallet' | null;

// Available PvP stake tiers (in ETH on Base mainnet)
export const STAKE_TIERS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05];

interface GameStore {
  // Auth
  isLoggedIn: boolean;
  userEmail: string;
  authMethod: AuthMethod;
  login: (email: string, username: string, method: AuthMethod) => void;
  signup: (email: string, username: string, method: AuthMethod) => void;
  logout: () => void;

  // Wallet
  isConnected: boolean;
  address: string | null;
  balance: number;
  walletBalance: number;
  gameWallet: string | null;
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
  screen: 'splash' | 'login' | 'signup' | 'forgot-password' | 'lobby' | 'mode-select' | 'matchmaking' | 'game' | 'result' | 'leaderboard' | 'shop' | 'profile' | 'withdraw' | 'deposit' | 'transactions' | 'tutorial' | 'referral';
  setScreen: (screen: GameStore['screen']) => void;
  gameMode: 'pvp' | null;
  setGameMode: (mode: 'pvp') => void;
  difficulty: 'easy' | 'medium' | 'hard';
  setDifficulty: (d: GameStore['difficulty']) => void;

  // PvP Staking
  pvpStakeAmount: number;
  setPvpStakeAmount: (amount: number) => void;

  // Stats
  wins: number;
  losses: number;
  gamesPlayed: number;
  totalEarnings: number;
  totalLost: number;
  addWin: (earnings: number) => void;
  addLoss: (stakeLost?: number) => void;

  // Perk tracking
  usedPerks: Record<string, boolean>;
  markPerkUsed: (boardId: string) => void;
  isPerkAvailable: (boardId: string) => boolean;
  resetPerk: (boardId: string) => void;

  // Leaderboard
  leaderboard: LeaderboardEntry[];
  playerRank: number;

  // Backend sync
  userId: string | null; // server-side user ID
  currentMatchId: string | null; // active match ID from backend
  setUserId: (id: string | null) => void;
  setCurrentMatchId: (id: string | null) => void;
  syncFromBackend: () => Promise<void>; // pull latest profile + leaderboard from API
  fetchLeaderboard: () => Promise<void>; // fetch global leaderboard from API
}

const BOARDS: Board[] = [
  // ── Original 8 boards ────────────────────────────────────────────────────
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

  // ── Common boards (price 0.001–0.003) ────────────────────────────────────
  {
    id: 'pebble',
    name: 'Pebble',
    price: 0.001,
    color: '#94a3b8',
    gradient: 'from-slate-400 to-slate-500',
    perk: 'Steady Aim',
    perkDescription: 'Ball angle is slightly more predictable',
    perkIcon: '🪨',
    owned: false,
    rarity: 'common',
  },
  {
    id: 'sprout',
    name: 'Sprout',
    price: 0.001,
    color: '#4ade80',
    gradient: 'from-green-400 to-lime-400',
    perk: 'Grow Up',
    perkDescription: 'Paddle slowly grows 10% each rally',
    perkIcon: '🌱',
    owned: false,
    rarity: 'common',
  },
  {
    id: 'copper',
    name: 'Copper',
    price: 0.001,
    color: '#b45309',
    gradient: 'from-amber-700 to-yellow-600',
    perk: 'Rust Guard',
    perkDescription: 'First missed ball doesn\'t count as a point',
    perkIcon: '🔩',
    owned: false,
    rarity: 'common',
  },
  {
    id: 'tide',
    name: 'Tide',
    price: 0.0015,
    color: '#0ea5e9',
    gradient: 'from-sky-500 to-blue-400',
    perk: 'Wave Ride',
    perkDescription: 'Paddle moves in smooth sine wave pattern',
    perkIcon: '🌊',
    owned: false,
    rarity: 'common',
  },
  {
    id: 'chalk',
    name: 'Chalk Board',
    price: 0.0015,
    color: '#e2e8f0',
    gradient: 'from-slate-200 to-gray-300',
    perk: 'Erase Trail',
    perkDescription: 'Ball trail disappears confusing opponent',
    perkIcon: '🖊️',
    owned: false,
    rarity: 'common',
  },
  {
    id: 'rust',
    name: 'Rustbelt',
    price: 0.002,
    color: '#c2410c',
    gradient: 'from-orange-700 to-red-700',
    perk: 'Heavy Metal',
    perkDescription: 'Ball is heavier, harder to deflect off-angle',
    perkIcon: '⚙️',
    owned: false,
    rarity: 'common',
  },
  {
    id: 'dusk',
    name: 'Dusk',
    price: 0.002,
    color: '#f59e0b',
    gradient: 'from-amber-400 to-orange-500',
    perk: 'Golden Hour',
    perkDescription: 'Score +1 bonus point on the 7th rally',
    perkIcon: '🌅',
    owned: false,
    rarity: 'common',
  },
  {
    id: 'cotton',
    name: 'Cotton Cloud',
    price: 0.002,
    color: '#f0f9ff',
    gradient: 'from-sky-100 to-blue-200',
    perk: 'Soft Bounce',
    perkDescription: 'Ball bounces at wider angles from your paddle',
    perkIcon: '☁️',
    owned: false,
    rarity: 'common',
  },
  {
    id: 'pine',
    name: 'Pine Forest',
    price: 0.0025,
    color: '#166534',
    gradient: 'from-green-800 to-green-600',
    perk: 'Root Hold',
    perkDescription: 'Paddle briefly anchors mid-game once per match',
    perkIcon: '🌲',
    owned: false,
    rarity: 'common',
  },
  {
    id: 'sand',
    name: 'Sandstorm',
    price: 0.0025,
    color: '#d97706',
    gradient: 'from-yellow-600 to-amber-500',
    perk: 'Dust Cloud',
    perkDescription: 'Screen dims for opponent for 1.5s once',
    perkIcon: '🏜️',
    owned: false,
    rarity: 'common',
  },
  {
    id: 'steel',
    name: 'Steel Plate',
    price: 0.0025,
    color: '#64748b',
    gradient: 'from-slate-500 to-zinc-600',
    perk: 'Deflect',
    perkDescription: 'Ball reflects at a perfect 90° once per game',
    perkIcon: '🛡️',
    owned: false,
    rarity: 'common',
  },
  {
    id: 'coral',
    name: 'Coral Reef',
    price: 0.003,
    color: '#f43f5e',
    gradient: 'from-rose-400 to-pink-400',
    perk: 'Current Pull',
    perkDescription: 'Ball drifts 5% toward center each bounce',
    perkIcon: '🪸',
    owned: false,
    rarity: 'common',
  },

  {
    id: 'bamboo',
    name: 'Bamboo',
    price: 0.001,
    color: '#86efac',
    gradient: 'from-green-300 to-lime-300',
    perk: 'Flexible',
    perkDescription: 'Paddle bends to widen hitbox by 10%',
    perkIcon: '🎋',
    owned: false,
    rarity: 'common',
  },
  {
    id: 'spark',
    name: 'Spark',
    price: 0.002,
    color: '#fde68a',
    gradient: 'from-yellow-200 to-amber-400',
    perk: 'Static Charge',
    perkDescription: 'Every 5th hit adds +0.5 to ball speed',
    perkIcon: '🌟',
    owned: false,
    rarity: 'common',
  },
  {
    id: 'obsidian-shard',
    name: 'Obsidian Shard',
    price: 0.0025,
    color: '#312e81',
    gradient: 'from-indigo-900 to-slate-800',
    perk: 'Sharp Edge',
    perkDescription: 'Ball angle sharpens by 10° on each corner hit',
    perkIcon: '🔪',
    owned: false,
    rarity: 'common',
  },

  // ── Rare boards (price 0.003–0.01) ───────────────────────────────────────
  {
    id: 'magnet',
    name: 'Magnet',
    price: 0.004,
    color: '#dc2626',
    gradient: 'from-red-600 to-rose-500',
    perk: 'Ball Magnet',
    perkDescription: 'Paddle attracts ball slightly when near edge',
    perkIcon: '🧲',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'mirage',
    name: 'Mirage',
    price: 0.004,
    color: '#fbbf24',
    gradient: 'from-yellow-400 to-orange-400',
    perk: 'Fake Ball',
    perkDescription: 'A decoy ball appears for 1s once per game',
    perkIcon: '🃏',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'nebula',
    name: 'Nebula',
    price: 0.004,
    color: '#7c3aed',
    gradient: 'from-violet-600 to-purple-700',
    perk: 'Stardust',
    perkDescription: 'Ball leaves a glowing trail blinding opponent',
    perkIcon: '✨',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'acid',
    name: 'Acid Rain',
    price: 0.005,
    color: '#84cc16',
    gradient: 'from-lime-500 to-green-500',
    perk: 'Corrosive',
    perkDescription: 'Opponent paddle shrinks 15% after 3 volleys',
    perkIcon: '🧪',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    price: 0.005,
    color: '#06b6d4',
    gradient: 'from-cyan-500 to-teal-400',
    perk: 'Northern Lights',
    perkDescription: 'Screen flashes colors briefly disorienting foe',
    perkIcon: '🌈',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'bone',
    name: 'Bone Yard',
    price: 0.005,
    color: '#fef3c7',
    gradient: 'from-yellow-100 to-amber-200',
    perk: 'Dead Zone',
    perkDescription: 'A ghost zone blocks opponent\'s side for 2s',
    perkIcon: '💀',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'cursed',
    name: 'Cursed Relic',
    price: 0.006,
    color: '#78350f',
    gradient: 'from-yellow-900 to-amber-800',
    perk: 'Hex Ball',
    perkDescription: 'Ball randomly changes speed twice per game',
    perkIcon: '🔮',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'delta',
    name: 'Delta Force',
    price: 0.006,
    color: '#0f766e',
    gradient: 'from-teal-700 to-cyan-600',
    perk: 'Tactical Strike',
    perkDescription: 'Ball speed surges 25% for one serve',
    perkIcon: '🎯',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'echo',
    name: 'Echo Chamber',
    price: 0.006,
    color: '#6366f1',
    gradient: 'from-indigo-500 to-blue-500',
    perk: 'Reverb',
    perkDescription: 'Last ball trajectory replays as a ghost hint',
    perkIcon: '🔊',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'ember',
    name: 'Ember',
    price: 0.007,
    color: '#ea580c',
    gradient: 'from-orange-600 to-amber-500',
    perk: 'Ignite',
    perkDescription: 'Ball leaves fire trail burning opponent\'s side',
    perkIcon: '🕯️',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'fog',
    name: 'Fog Machine',
    price: 0.007,
    color: '#9ca3af',
    gradient: 'from-gray-400 to-slate-400',
    perk: 'Smoke Screen',
    perkDescription: 'Fog covers opponent\'s half for 2s once',
    perkIcon: '🌫️',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'glitch',
    name: 'Glitch',
    price: 0.007,
    color: '#10b981',
    gradient: 'from-emerald-500 to-teal-500',
    perk: 'Buffer Error',
    perkDescription: 'Opponent controls briefly invert for 1s',
    perkIcon: '📟',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'honey',
    name: 'Honeycomb',
    price: 0.008,
    color: '#f59e0b',
    gradient: 'from-amber-500 to-yellow-400',
    perk: 'Sticky Paddle',
    perkDescription: 'Ball sticks to paddle for 0.3s once, then fires',
    perkIcon: '🍯',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'iron',
    name: 'Iron Curtain',
    price: 0.008,
    color: '#475569',
    gradient: 'from-slate-600 to-gray-700',
    perk: 'Iron Wall',
    perkDescription: 'Paddle becomes an unbreakable wall for 1s',
    perkIcon: '🪖',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'jungle',
    name: 'Jungle Run',
    price: 0.008,
    color: '#15803d',
    gradient: 'from-green-700 to-emerald-600',
    perk: 'Vine Swing',
    perkDescription: 'Ball curves in a wild arc once per game',
    perkIcon: '🌿',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'krypton',
    name: 'Krypton',
    price: 0.009,
    color: '#22d3ee',
    gradient: 'from-cyan-400 to-sky-500',
    perk: 'Noble Gas',
    perkDescription: 'Ball passes through own paddle once per game',
    perkIcon: '⚗️',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'laser',
    name: 'Laser Grid',
    price: 0.009,
    color: '#ef4444',
    gradient: 'from-red-500 to-rose-400',
    perk: 'Laser Focus',
    perkDescription: 'Ball travels in a perfectly straight line for 2s',
    perkIcon: '🔴',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'marble',
    name: 'Marble Hall',
    price: 0.009,
    color: '#e2e8f0',
    gradient: 'from-slate-200 to-stone-300',
    perk: 'Ricochet',
    perkDescription: 'Ball bounces off walls at sharper angles once',
    perkIcon: '🎱',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'neon',
    name: 'Neon Nights',
    price: 0.009,
    color: '#f0abfc',
    gradient: 'from-fuchsia-400 to-pink-400',
    perk: 'Neon Flash',
    perkDescription: 'Blinds screen with flash for 0.5s once per game',
    perkIcon: '💡',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    price: 0.01,
    color: '#1e1b4b',
    gradient: 'from-indigo-950 to-slate-900',
    perk: 'Dark Matter',
    perkDescription: 'Ball becomes black on black for 1.5s once',
    perkIcon: '🖤',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'prism',
    name: 'Prism',
    price: 0.01,
    color: '#c084fc',
    gradient: 'from-purple-400 to-fuchsia-400',
    perk: 'Light Split',
    perkDescription: 'Ball briefly splits into two for one bounce',
    perkIcon: '🔷',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'quasar',
    name: 'Quasar',
    price: 0.01,
    color: '#818cf8',
    gradient: 'from-indigo-400 to-violet-500',
    perk: 'Jet Stream',
    perkDescription: 'Ball accelerates 30% when near center line',
    perkIcon: '💫',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'rune',
    name: 'Rune Stone',
    price: 0.01,
    color: '#6d28d9',
    gradient: 'from-violet-700 to-purple-800',
    perk: 'Ancient Ward',
    perkDescription: 'Auto-blocks one incoming shot per game',
    perkIcon: '🧿',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'sakura',
    name: 'Sakura',
    price: 0.01,
    color: '#fb7185',
    gradient: 'from-rose-400 to-pink-300',
    perk: 'Petal Drift',
    perkDescription: 'Ball drifts sideways 10px every bounce',
    perkIcon: '🌸',
    owned: false,
    rarity: 'rare',
  },

  {
    id: 'tempest',
    name: 'Tempest',
    price: 0.0075,
    color: '#0284c7',
    gradient: 'from-sky-600 to-blue-700',
    perk: 'Storm Serve',
    perkDescription: 'Ball speed increases 15% on every serve',
    perkIcon: '⛈️',
    owned: false,
    rarity: 'rare',
  },
  {
    id: 'verdant',
    name: 'Verdant',
    price: 0.009,
    color: '#16a34a',
    gradient: 'from-green-600 to-teal-500',
    perk: 'Overgrowth',
    perkDescription: 'Paddle extends 20% on every 4th successful rally',
    perkIcon: '🍀',
    owned: false,
    rarity: 'rare',
  },

  // ── Epic boards (price 0.01–0.03) ────────────────────────────────────────
  {
    id: 'abyssal',
    name: 'Abyssal',
    price: 0.011,
    color: '#0c4a6e',
    gradient: 'from-sky-900 to-blue-950',
    perk: 'Deep Pull',
    perkDescription: 'Drags ball toward your paddle from mid-court',
    perkIcon: '🌊',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'blizzard',
    name: 'Blizzard',
    price: 0.012,
    color: '#bae6fd',
    gradient: 'from-sky-200 to-blue-300',
    perk: 'Whiteout',
    perkDescription: 'Opponent\'s side whites out for 2s once per game',
    perkIcon: '🌨️',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'circuit',
    name: 'Circuit Board',
    price: 0.012,
    color: '#16a34a',
    gradient: 'from-green-600 to-cyan-600',
    perk: 'Overclock',
    perkDescription: 'Your paddle speed doubles for 2s once per game',
    perkIcon: '💻',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'crimson',
    name: 'Crimson Tide',
    price: 0.013,
    color: '#b91c1c',
    gradient: 'from-red-700 to-rose-600',
    perk: 'Blood Rage',
    perkDescription: 'After losing a point, speed +15% for next rally',
    perkIcon: '😤',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'cyber',
    name: 'Cyberpunk',
    price: 0.013,
    color: '#f0abfc',
    gradient: 'from-fuchsia-500 to-cyan-500',
    perk: 'Neural Hack',
    perkDescription: 'Mirror opponent controls for 1.5s once per game',
    perkIcon: '🤖',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'demon',
    name: 'Demon Core',
    price: 0.014,
    color: '#7f1d1d',
    gradient: 'from-red-900 to-orange-800',
    perk: 'Hellfire',
    perkDescription: 'Ball speeds up 40% for a single serve once',
    perkIcon: '😈',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'dragon',
    name: 'Dragon Scale',
    price: 0.014,
    color: '#dc2626',
    gradient: 'from-red-600 to-amber-600',
    perk: 'Breathe Fire',
    perkDescription: 'Scorches opponent\'s paddle, halving its size for 2s',
    perkIcon: '🐉',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'eclipse',
    name: 'Eclipse',
    price: 0.015,
    color: '#1e293b',
    gradient: 'from-slate-800 to-indigo-900',
    perk: 'Total Darkness',
    perkDescription: 'Entire screen blacks out for 1s once per game',
    perkIcon: '🌑',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'electric',
    name: 'Electric Slide',
    price: 0.015,
    color: '#facc15',
    gradient: 'from-yellow-400 to-cyan-400',
    perk: 'Zap Shot',
    perkDescription: 'Ball zaps across court twice as fast once',
    perkIcon: '🌩️',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'enigma',
    name: 'Enigma',
    price: 0.016,
    color: '#4f46e5',
    gradient: 'from-indigo-600 to-purple-700',
    perk: 'Code Breaker',
    perkDescription: 'Scrambles opponent\'s score display for 3s',
    perkIcon: '🔐',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'frostfire',
    name: 'Frost Fire',
    price: 0.016,
    color: '#38bdf8',
    gradient: 'from-sky-400 to-orange-500',
    perk: 'Polar Ignite',
    perkDescription: 'Slows then speeds ball in alternating 2s bursts',
    perkIcon: '🧊',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'golem',
    name: 'Stone Golem',
    price: 0.017,
    color: '#78716c',
    gradient: 'from-stone-500 to-gray-600',
    perk: 'Rock Shield',
    perkDescription: 'Paddle absorbs impact; ball bounces slower once',
    perkIcon: '🗿',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'halo',
    name: 'Halo',
    price: 0.017,
    color: '#fde68a',
    gradient: 'from-yellow-200 to-amber-300',
    perk: 'Divine Shield',
    perkDescription: 'Deflects next incoming ball automatically',
    perkIcon: '😇',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'hypno',
    name: 'Hypno Swirl',
    price: 0.018,
    color: '#d946ef',
    gradient: 'from-fuchsia-600 to-purple-600',
    perk: 'Mind Warp',
    perkDescription: 'Opponent controls reverse for 2s once per game',
    perkIcon: '🌀',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'iceberg',
    name: 'Iceberg',
    price: 0.018,
    color: '#cffafe',
    gradient: 'from-cyan-100 to-sky-300',
    perk: 'Cold Snap',
    perkDescription: 'Freezes opponent\'s paddle for 2s once per game',
    perkIcon: '🧊',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'jaguar',
    name: 'Jaguar',
    price: 0.019,
    color: '#92400e',
    gradient: 'from-amber-800 to-yellow-700',
    perk: 'Pounce',
    perkDescription: 'Your paddle lunges forward 30px once per rally',
    perkIcon: '🐆',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'kraken',
    name: 'Kraken',
    price: 0.019,
    color: '#164e63',
    gradient: 'from-cyan-900 to-blue-800',
    perk: 'Tentacle Grip',
    perkDescription: 'Ball sticks then launches at double speed',
    perkIcon: '🦑',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'lava',
    name: 'Lava Flow',
    price: 0.02,
    color: '#b45309',
    gradient: 'from-amber-700 to-red-700',
    perk: 'Eruption',
    perkDescription: 'Ball explodes on miss, scoring +1 bonus point',
    perkIcon: '🌋',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'lucid',
    name: 'Lucid Dream',
    price: 0.02,
    color: '#818cf8',
    gradient: 'from-indigo-400 to-fuchsia-500',
    perk: 'Dream State',
    perkDescription: 'Ball leaves afterimage trail for 3s once',
    perkIcon: '💤',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'manticore',
    name: 'Manticore',
    price: 0.021,
    color: '#9f1239',
    gradient: 'from-rose-800 to-red-700',
    perk: 'Venomous',
    perkDescription: 'Each hit slows opponent 5% (stacks 3 times)',
    perkIcon: '🦂',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'monsoon',
    name: 'Monsoon',
    price: 0.021,
    color: '#1d4ed8',
    gradient: 'from-blue-700 to-indigo-600',
    perk: 'Downpour',
    perkDescription: 'Ball trajectory bends downward mid-flight',
    perkIcon: '🌧️',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'nova',
    name: 'Nova Burst',
    price: 0.022,
    color: '#fbbf24',
    gradient: 'from-amber-400 to-orange-500',
    perk: 'Supernova',
    perkDescription: 'Ball doubles in size for one hit',
    perkIcon: '💥',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'oracle',
    name: 'Oracle',
    price: 0.022,
    color: '#7c3aed',
    gradient: 'from-violet-600 to-indigo-700',
    perk: 'Foresight',
    perkDescription: 'Predicted ball path shown briefly once per game',
    perkIcon: '🔮',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'poltergeist',
    name: 'Poltergeist',
    price: 0.023,
    color: '#86efac',
    gradient: 'from-green-300 to-teal-400',
    perk: 'Haunt',
    perkDescription: 'Ghost ball appears beside real ball for 2s',
    perkIcon: '👺',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'pulse',
    name: 'Pulse Wave',
    price: 0.023,
    color: '#06b6d4',
    gradient: 'from-cyan-600 to-sky-600',
    perk: 'Shockwave',
    perkDescription: 'Pushes opponent\'s paddle back 20px on hit',
    perkIcon: '📡',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'quicksilver',
    name: 'Quicksilver',
    price: 0.024,
    color: '#94a3b8',
    gradient: 'from-slate-400 to-zinc-400',
    perk: 'Mercury Rush',
    perkDescription: 'Paddle speed triples for 1.5s once per game',
    perkIcon: '🪄',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'reactor',
    name: 'Reactor',
    price: 0.024,
    color: '#34d399',
    gradient: 'from-emerald-400 to-green-600',
    perk: 'Chain Reaction',
    perkDescription: 'Each consecutive hit speeds ball up 5%',
    perkIcon: '☢️',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'specter',
    name: 'Specter',
    price: 0.025,
    color: '#e0e7ff',
    gradient: 'from-indigo-100 to-violet-300',
    perk: 'Phase Through',
    perkDescription: 'Ball passes through walls once per game',
    perkIcon: '🕸️',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'thorn',
    name: 'Thorn Bush',
    price: 0.025,
    color: '#65a30d',
    gradient: 'from-lime-600 to-green-700',
    perk: 'Barbed Return',
    perkDescription: 'Returns ball 10% faster than it arrived',
    perkIcon: '🌵',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'tsunami',
    name: 'Tsunami',
    price: 0.026,
    color: '#0369a1',
    gradient: 'from-sky-700 to-blue-800',
    perk: 'Tidal Force',
    perkDescription: 'Pushes ball toward opponent\'s goal for 2s',
    perkIcon: '🏄',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'ultraviolet',
    name: 'Ultraviolet',
    price: 0.026,
    color: '#c026d3',
    gradient: 'from-fuchsia-600 to-violet-600',
    perk: 'UV Burn',
    perkDescription: 'Opponent\'s paddle outline flickers for 3s',
    perkIcon: '🔦',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'venom',
    name: 'Venom',
    price: 0.027,
    color: '#4d7c0f',
    gradient: 'from-lime-800 to-green-900',
    perk: 'Toxic Shot',
    perkDescription: 'Ball poisons opponent\'s side, slowing them 20%',
    perkIcon: '🐍',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'warlock',
    name: 'Warlock',
    price: 0.028,
    color: '#581c87',
    gradient: 'from-purple-900 to-violet-800',
    perk: 'Spell Cast',
    perkDescription: 'Ball follows a zigzag path for one rally',
    perkIcon: '🧙',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'xenon',
    name: 'Xenon',
    price: 0.028,
    color: '#67e8f9',
    gradient: 'from-cyan-300 to-blue-400',
    perk: 'Plasma Arc',
    perkDescription: 'Ball arcs in a curve toward bottom wall once',
    perkIcon: '🔵',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'yeti',
    name: 'Yeti Roar',
    price: 0.029,
    color: '#e0f2fe',
    gradient: 'from-sky-100 to-slate-300',
    perk: 'Avalanche',
    perkDescription: 'Ball size doubles, harder to miss for 2s',
    perkIcon: '🦣',
    owned: false,
    rarity: 'epic',
  },
  {
    id: 'zephyr',
    name: 'Zephyr',
    price: 0.029,
    color: '#bfdbfe',
    gradient: 'from-blue-200 to-indigo-300',
    perk: 'Wind Gust',
    perkDescription: 'Ball swerves left 20px mid-flight once per game',
    perkIcon: '💨',
    owned: false,
    rarity: 'epic',
  },

  // ── Legendary boards (price 0.03–0.1) ────────────────────────────────────
  {
    id: 'apocalypse',
    name: 'Apocalypse',
    price: 0.035,
    color: '#7f1d1d',
    gradient: 'from-red-950 to-orange-900',
    perk: 'End Times',
    perkDescription: 'Ball splits into 3 for the final 5 seconds',
    perkIcon: '☄️',
    owned: false,
    rarity: 'legendary',
  },
  {
    id: 'celestial',
    name: 'Celestial',
    price: 0.035,
    color: '#fef9c3',
    gradient: 'from-yellow-100 via-sky-200 to-indigo-300',
    perk: 'Star Forge',
    perkDescription: 'Ball homes in on opponent\'s goal for 1.5s',
    perkIcon: '⭐',
    owned: false,
    rarity: 'legendary',
  },
  {
    id: 'chronos',
    name: 'Chronos',
    price: 0.04,
    color: '#6b7280',
    gradient: 'from-gray-500 to-slate-700',
    perk: 'Time Warp',
    perkDescription: 'Rewinds ball position 1s into the past once',
    perkIcon: '⏳',
    owned: false,
    rarity: 'legendary',
  },
  {
    id: 'colossus',
    name: 'Colossus',
    price: 0.04,
    color: '#78350f',
    gradient: 'from-amber-900 to-stone-800',
    perk: 'Titan Slam',
    perkDescription: 'Smashes ball at 3x speed once per game',
    perkIcon: '🗼',
    owned: false,
    rarity: 'legendary',
  },
  {
    id: 'divine',
    name: 'Divine Light',
    price: 0.045,
    color: '#fef08a',
    gradient: 'from-yellow-200 via-amber-200 to-orange-300',
    perk: 'Godlike',
    perkDescription: 'Auto-returns any ball within 50px once',
    perkIcon: '✝️',
    owned: false,
    rarity: 'legendary',
  },
  {
    id: 'elder',
    name: 'Elder Dragon',
    price: 0.045,
    color: '#92400e',
    gradient: 'from-amber-800 via-red-700 to-purple-800',
    perk: 'Ancient Fury',
    perkDescription: 'All hits deal 2x score value for 5 seconds',
    perkIcon: '🐲',
    owned: false,
    rarity: 'legendary',
  },
  {
    id: 'eternal',
    name: 'Eternal Flame',
    price: 0.05,
    color: '#fdba74',
    gradient: 'from-orange-300 via-red-500 to-purple-600',
    perk: 'Undying',
    perkDescription: 'Next scored point against you is negated once',
    perkIcon: '♾️',
    owned: false,
    rarity: 'legendary',
  },
  {
    id: 'forbidden',
    name: 'Forbidden Tome',
    price: 0.055,
    color: '#4c1d95',
    gradient: 'from-violet-900 to-purple-950',
    perk: 'Dark Arts',
    perkDescription: 'Steals 1 point from opponent once per match',
    perkIcon: '📜',
    owned: false,
    rarity: 'legendary',
  },
  {
    id: 'genesis',
    name: 'Genesis',
    price: 0.06,
    color: '#f0fdf4',
    gradient: 'from-green-100 via-emerald-300 to-teal-400',
    perk: 'Big Bang',
    perkDescription: 'Creates 2 clone balls for 3 seconds once',
    perkIcon: '🌍',
    owned: false,
    rarity: 'legendary',
  },
  {
    id: 'omega',
    name: 'Omega Protocol',
    price: 0.065,
    color: '#0f172a',
    gradient: 'from-slate-950 to-indigo-950',
    perk: 'Final Form',
    perkDescription: 'Activates every perk simultaneously for 1s',
    perkIcon: '🔱',
    owned: false,
    rarity: 'legendary',
  },
  {
    id: 'phoenix',
    name: 'Phoenix',
    price: 0.07,
    color: '#f97316',
    gradient: 'from-orange-500 via-red-500 to-yellow-400',
    perk: 'Rebirth',
    perkDescription: 'First point lost is immediately cancelled once',
    perkIcon: '🦅',
    owned: false,
    rarity: 'legendary',
  },
  {
    id: 'singularity',
    name: 'Singularity',
    price: 0.075,
    color: '#000000',
    gradient: 'from-black via-indigo-950 to-purple-950',
    perk: 'Event Horizon',
    perkDescription: 'Ball orbits your paddle for 2s before launching',
    perkIcon: '🕳️',
    owned: false,
    rarity: 'legendary',
  },
  {
    id: 'titan',
    name: 'Titan',
    price: 0.08,
    color: '#1e3a8a',
    gradient: 'from-blue-900 via-indigo-800 to-slate-700',
    perk: 'Overwhelm',
    perkDescription: 'Paddle spans full court height for 2s once',
    perkIcon: '⚔️',
    owned: false,
    rarity: 'legendary',
  },
  {
    id: 'transcendent',
    name: 'Transcendent',
    price: 0.09,
    color: '#fdf4ff',
    gradient: 'from-fuchsia-100 via-purple-300 to-indigo-400',
    perk: 'Ascension',
    perkDescription: 'Ball ignores all walls for 3 seconds once',
    perkIcon: '🌠',
    owned: false,
    rarity: 'legendary',
  },
  {
    id: 'ultima',
    name: 'Ultima',
    price: 0.1,
    color: '#fbbf24',
    gradient: 'from-yellow-400 via-orange-500 via-red-600 to-purple-700',
    perk: 'Omnipotence',
    perkDescription: 'Opponent paddle invisible + ball 2x speed for 3s',
    perkIcon: '👑',
    owned: false,
    rarity: 'legendary',
  },
];

// Sort leaderboard: by wins DESC, then by joinedAt ASC (earlier signup = higher on ties)
function sortLeaderboard(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries]
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return a.joinedAt - b.joinedAt; // earlier signup ranks higher on tie
    })
    .map((entry, i) => ({ ...entry, rank: i + 1 }));
}

// Build leaderboard — only real players (just the current user for now)
function buildLeaderboard(playerUsername: string, playerWins: number, playerLosses: number, playerEarnings: number, playerJoinedAt: number, playerAddress: string): LeaderboardEntry[] {
  const playerEntry: LeaderboardEntry = {
    rank: 1,
    address: playerAddress ? `${playerAddress.slice(0, 6)}...${playerAddress.slice(-4)}` : '0x0000...0000',
    username: playerUsername,
    wins: playerWins,
    losses: playerLosses,
    earnings: playerEarnings,
    avatar: '🎮',
    joinedAt: playerJoinedAt,
    isPlayer: true,
  };

  // Only the current player for now — when multiplayer backend is added,
  // other real players will be merged here
  return sortLeaderboard([playerEntry]);
}

// Load/save player's joinedAt timestamp
function loadJoinedAt(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const saved = localStorage.getItem('chainpong-joinedat');
    if (saved) return Number(saved);
  } catch {}
  return 0; // 0 means not yet registered
}

function saveJoinedAt(ts: number) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem('chainpong-joinedat', String(ts)); } catch {}
}


// Load persisted auth
function loadAuth(): { isLoggedIn: boolean; userEmail: string; username: string; authMethod: AuthMethod; gameWallet: string | null } {
  if (typeof window === 'undefined') return { isLoggedIn: false, userEmail: '', username: 'Player', authMethod: null, gameWallet: null };
  try {
    const saved = localStorage.getItem('chainpong-auth');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        isLoggedIn: parsed.isLoggedIn ?? false,
        userEmail: parsed.userEmail ?? '',
        username: parsed.username ?? 'Player',
        authMethod: parsed.authMethod ?? null,
        gameWallet: null, // always fetch real address from backend via syncFromBackend
      };
    }
  } catch {}
  return { isLoggedIn: false, userEmail: '', username: 'Player', authMethod: null, gameWallet: null };
}

function saveAuth(auth: { isLoggedIn: boolean; userEmail: string; username: string; authMethod: AuthMethod; gameWallet: string | null }) {
  if (typeof window === 'undefined') return;
  // Don't persist gameWallet — real address comes from backend
  const { gameWallet: _, ...rest } = auth;
  try { localStorage.setItem('chainpong-auth', JSON.stringify(rest)); } catch {}
}

// Load persisted stats
function loadStats() {
  if (typeof window === 'undefined') return { wins: 0, losses: 0, gamesPlayed: 0, totalEarnings: 0, totalLost: 0, usedPerks: {}, ownedBoards: ['classic'] };
  try {
    const saved = localStorage.getItem('chainpong-stats');
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...parsed, totalLost: parsed.totalLost || 0, ownedBoards: parsed.ownedBoards || ['classic'] };
    }
  } catch {}
  return { wins: 0, losses: 0, gamesPlayed: 0, totalEarnings: 0, totalLost: 0, usedPerks: {}, ownedBoards: ['classic'] };
}

function saveStats(state: { wins: number; losses: number; gamesPlayed: number; totalEarnings: number; totalLost: number; usedPerks: Record<string, boolean>; ownedBoards?: string[] }) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('chainpong-stats', JSON.stringify({
      wins: state.wins,
      losses: state.losses,
      gamesPlayed: state.gamesPlayed,
      totalEarnings: state.totalEarnings,
      totalLost: state.totalLost,
      usedPerks: state.usedPerks,
      ownedBoards: state.ownedBoards || ['classic'],
    }));
  } catch {}
}

const initialStats = loadStats();
const initialAuth = loadAuth();
const initialJoinedAt = loadJoinedAt();

// Restore owned boards from persisted data
const initialBoards = BOARDS.map((b) =>
  (initialStats.ownedBoards || ['classic']).includes(b.id) ? { ...b, owned: true } : b
);

// Build the initial leaderboard
const initialLeaderboard = initialAuth.isLoggedIn && initialJoinedAt > 0
  ? buildLeaderboard(
      initialAuth.username || 'Player',
      initialStats.wins,
      initialStats.losses,
      initialStats.totalEarnings,
      initialJoinedAt,
      initialAuth.gameWallet || '0x0000...0000'
    )
  : [];

const initialPlayerRank = initialLeaderboard.find(e => e.isPlayer)?.rank || initialLeaderboard.length + 1;

export const useGameStore = create<GameStore>((set, get) => ({
  // Auth
  isLoggedIn: initialAuth.isLoggedIn,
  userEmail: initialAuth.userEmail,
  authMethod: initialAuth.authMethod,

  login: (email, username, method) => {
    const gameWallet = null; // real address comes from backend via syncFromBackend
    const auth = { isLoggedIn: true, userEmail: email, username, authMethod: method, gameWallet };
    saveAuth(auth);
    try {
      const existing = JSON.parse(localStorage.getItem('chainpong-accounts') || '{}');
      existing[email] = username;
      localStorage.setItem('chainpong-accounts', JSON.stringify(existing));
    } catch {}

    // Ensure joinedAt exists (for returning users who signed up before this feature)
    let jt = loadJoinedAt();
    if (!jt) {
      jt = Date.now();
      saveJoinedAt(jt);
    }

    const state = get();
    const lb = buildLeaderboard(username, state.wins, state.losses, state.totalEarnings, jt, gameWallet || state.address || '');
    const pRank = lb.find(e => e.isPlayer)?.rank || lb.length;

    set({ isLoggedIn: true, userEmail: email, username, authMethod: method, gameWallet, screen: 'lobby', leaderboard: lb, playerRank: pRank });

    // Backend login (non-blocking) — sync stats from server
    if (method === 'email') {
      apiLogin(email, '').catch(() => {}); // password handled in Login.tsx
    }
    // Fetch server leaderboard after login
    setTimeout(() => get().fetchLeaderboard(), 500);
  },

  signup: (email, username, method) => {
    const gameWallet = null; // real address comes from backend via syncFromBackend
    const auth = { isLoggedIn: true, userEmail: email, username, authMethod: method, gameWallet };
    saveAuth(auth);
    try {
      const existing = JSON.parse(localStorage.getItem('chainpong-accounts') || '{}');
      existing[email] = username;
      localStorage.setItem('chainpong-accounts', JSON.stringify(existing));
    } catch {}

    // New user — save joinedAt NOW (this is the key for ordering new signups)
    const joinedAt = Date.now();
    saveJoinedAt(joinedAt);

    // New user has 0 wins so they go to the bottom of the leaderboard
    const lb = buildLeaderboard(username, 0, 0, 0, joinedAt, gameWallet || '');
    const pRank = lb.find(e => e.isPlayer)?.rank || lb.length;

    set({ isLoggedIn: true, userEmail: email, username, authMethod: method, gameWallet, screen: 'lobby', leaderboard: lb, playerRank: pRank });

    // Fetch server leaderboard after signup
    setTimeout(() => get().fetchLeaderboard(), 500);
  },

  logout: () => {
    // Backend logout (non-blocking)
    apiLogout().catch(() => {});
    clearTokens();
    disconnectSocket();

    saveAuth({ isLoggedIn: false, userEmail: '', username: 'Player', authMethod: null, gameWallet: null });
    set({
      isLoggedIn: false,
      userEmail: '',
      username: 'Player',
      authMethod: null,
      gameWallet: null,
      screen: 'login',
      isConnected: false,
      address: null,
      balance: 0,
      walletBalance: 0,
      leaderboard: [],
      playerRank: 0,
      userId: null,
      currentMatchId: null,
    });
  },

  isConnected: false,
  address: null,
  balance: 0,
  walletBalance: 0,
  gameWallet: initialAuth.gameWallet,
  setConnected: (connected, address) => {
    set({ isConnected: connected, address: address || null });
    // If wallet disconnected and user was a wallet-auth user, log them out fully
    if (!connected) {
      const state = get();
      if (state.authMethod === 'wallet' && state.isLoggedIn) {
        state.logout();
      }
    }
  },
  setBalance: (balance) => set({ balance }),
  setWalletBalance: (walletBalance) => set({ walletBalance }),

  username: initialAuth.username || 'Player',
  setUsername: (username) => {
    set({ username });
    const state = get();
    const auth = { isLoggedIn: state.isLoggedIn, userEmail: state.userEmail, username, authMethod: state.authMethod, gameWallet: state.gameWallet };
    saveAuth(auth);
    // Rebuild leaderboard with new username
    const jt = loadJoinedAt();
    if (jt && state.isLoggedIn) {
      const lb = buildLeaderboard(username, state.wins, state.losses, state.totalEarnings, jt, state.gameWallet || state.address || '');
      const pRank = lb.find(e => e.isPlayer)?.rank || lb.length;
      set({ leaderboard: lb, playerRank: pRank });
    }
  },
  selectedBoard: 'classic',
  setSelectedBoard: (id) => set({ selectedBoard: id }),

  boards: initialBoards,
  buyBoard: (id) =>
    set((state) => {
      const newBoards = state.boards.map((b) => (b.id === id ? { ...b, owned: true } : b));
      const ownedIds = newBoards.filter((b) => b.owned).map((b) => b.id);
      const updated = {
        wins: state.wins,
        losses: state.losses,
        gamesPlayed: state.gamesPlayed,
        totalEarnings: state.totalEarnings,
        totalLost: state.totalLost,
        usedPerks: state.usedPerks,
        ownedBoards: ownedIds,
      };
      saveStats(updated);
      return {
        boards: newBoards,
        balance: state.balance - (state.boards.find((b) => b.id === id)?.price || 0),
      };
    }),

  screen: 'splash',
  setScreen: (screen) => set({ screen }),
  gameMode: null,
  setGameMode: (gameMode) => set({ gameMode }),
  difficulty: 'medium',
  setDifficulty: (difficulty) => set({ difficulty }),

  // PvP Staking
  pvpStakeAmount: 0.002,
  setPvpStakeAmount: (pvpStakeAmount) => set({ pvpStakeAmount }),

  // Stats
  wins: initialStats.wins,
  losses: initialStats.losses,
  gamesPlayed: initialStats.gamesPlayed,
  totalEarnings: initialStats.totalEarnings,
  totalLost: initialStats.totalLost || 0,

  addWin: (earnings) =>
    set((state) => {
      const ownedBoards = state.boards.filter((b) => b.owned).map((b) => b.id);
      const newWins = state.wins + 1;
      const newEarnings = state.totalEarnings + earnings;
      const updated = {
        wins: newWins,
        losses: state.losses,
        gamesPlayed: state.gamesPlayed + 1,
        totalEarnings: newEarnings,
        totalLost: state.totalLost,
        balance: state.balance + earnings,
        usedPerks: state.usedPerks,
        ownedBoards,
      };
      saveStats(updated);

      // Rebuild leaderboard — player's rank should go UP with more wins
      const jt = loadJoinedAt();
      const lb = buildLeaderboard(state.username, newWins, state.losses, newEarnings, jt || Date.now(), state.gameWallet || state.address || '');
      const pRank = lb.find(e => e.isPlayer)?.rank || lb.length;

      return { ...updated, leaderboard: lb, playerRank: pRank };
    }),

  addLoss: (stakeLost = 0) =>
    set((state) => {
      const ownedBoards = state.boards.filter((b) => b.owned).map((b) => b.id);
      const newTotalLost = state.totalLost + stakeLost;
      const newBalance = Math.max(0, state.balance - stakeLost);
      const newLosses = state.losses + 1;
      const updated = {
        wins: state.wins,
        losses: newLosses,
        gamesPlayed: state.gamesPlayed + 1,
        totalEarnings: state.totalEarnings,
        totalLost: newTotalLost,
        usedPerks: state.usedPerks,
        ownedBoards,
      };
      saveStats(updated);

      // Rebuild leaderboard
      const jt = loadJoinedAt();
      const lb = buildLeaderboard(state.username, state.wins, newLosses, state.totalEarnings, jt || Date.now(), state.gameWallet || state.address || '');
      const pRank = lb.find(e => e.isPlayer)?.rank || lb.length;

      return { losses: newLosses, gamesPlayed: updated.gamesPlayed, totalLost: newTotalLost, balance: newBalance, leaderboard: lb, playerRank: pRank };
    }),

  // Perk tracking
  usedPerks: initialStats.usedPerks || {},
  markPerkUsed: (boardId) =>
    set((state) => {
      const usedPerks = { ...state.usedPerks, [boardId]: true };
      const ownedBoards = state.boards.filter((b) => b.owned).map((b) => b.id);
      saveStats({ ...state, usedPerks, ownedBoards });
      return { usedPerks };
    }),
  isPerkAvailable: (boardId) => !get().usedPerks[boardId],
  resetPerk: (boardId) =>
    set((state) => {
      const usedPerks = { ...state.usedPerks };
      delete usedPerks[boardId];
      const ownedBoards = state.boards.filter((b) => b.owned).map((b) => b.id);
      saveStats({ ...state, usedPerks, ownedBoards });
      return { usedPerks };
    }),

  // Leaderboard
  leaderboard: initialLeaderboard,
  playerRank: initialPlayerRank,

  // Backend sync
  userId: null,
  currentMatchId: null,
  setUserId: (id) => set({ userId: id }),
  setCurrentMatchId: (id) => {
    set({ currentMatchId: id });
    // Persist active match for reconnection
    if (typeof window !== 'undefined') {
      try {
        if (id) {
          const state = get();
          localStorage.setItem('chainpong-active-match', JSON.stringify({
            matchId: id,
            board: state.selectedBoard,
            stake: state.pvpStakeAmount,
            timestamp: Date.now(),
          }));
        } else {
          localStorage.removeItem('chainpong-active-match');
        }
      } catch {}
    }
  },

  syncFromBackend: async () => {
    try {
      const token = getAccessToken();
      if (!token) return;

      const profileRes = await apiGetProfile();
      if (profileRes.success && profileRes.data) {
        const p = profileRes.data;
        const stats = p.stats;
        const ownedIds = p.boards.map(b => b.id);

        // Merge server stats into local state
        if (stats) {
          const state = get();
          const newBoards = state.boards.map(b => ({
            ...b,
            owned: ownedIds.includes(b.id),
          }));

          set({
            userId: p.id,
            username: p.username,
            gameWallet: p.gameWallet || null,
            wins: stats.wins,
            losses: stats.losses,
            gamesPlayed: stats.gamesPlayed,
            totalEarnings: parseFloat(stats.totalEarnings),
            totalLost: parseFloat(stats.totalLost),
            boards: newBoards,
          });

          // Save to localStorage too
          saveStats({
            wins: stats.wins,
            losses: stats.losses,
            gamesPlayed: stats.gamesPlayed,
            totalEarnings: parseFloat(stats.totalEarnings),
            totalLost: parseFloat(stats.totalLost),
            usedPerks: state.usedPerks,
            ownedBoards: ownedIds,
          });
        }
      }
    } catch (err) {
      console.warn('Backend sync failed (offline?):', err);
    }
  },

  fetchLeaderboard: async () => {
    try {
      const token = getAccessToken();
      if (!token) return;

      const res = await apiGetLeaderboard(1, 50, 'wins');
      if (res.success && res.data) {
        const serverEntries = res.data.entries;

        if (serverEntries.length > 0) {
          // Convert API entries to local format
          const lb: LeaderboardEntry[] = serverEntries.map(e => ({
            rank: e.rank,
            address: '',
            username: e.username,
            wins: e.wins,
            losses: e.losses,
            earnings: parseFloat(e.earnings),
            avatar: e.avatar,
            joinedAt: 0,
            isPlayer: e.isYou,
          }));

          const myRank = lb.find(e => e.isPlayer)?.rank || 0;
          set({ leaderboard: lb, playerRank: myRank });
        }
        // If no entries from server, keep local leaderboard
      }
    } catch (err) {
      console.warn('Leaderboard fetch failed (offline?):', err);
    }
  },
}));

