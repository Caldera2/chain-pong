import { Request } from 'express';

// ─── JWT Payload ─────────────────────────────────────
export interface JwtPayload {
  userId: string;
  username: string;
  authMethod: 'EMAIL' | 'WALLET';
}

// ─── Authenticated Request ───────────────────────────
export interface AuthRequest extends Request {
  user?: JwtPayload;
}

// ─── API Response Envelope ───────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ─── Leaderboard Entry (API response shape) ──────────
export interface LeaderboardEntryDTO {
  rank: number;
  userId: string;
  username: string;
  avatar: string;
  wins: number;
  losses: number;
  earnings: string; // decimal as string
  winStreak: number;
  rating: number;
  isYou: boolean;
}

// ─── Match DTO ───────────────────────────────────────
export interface MatchDTO {
  id: string;
  mode: 'PVP' | 'COMPUTER';
  status: string;
  player1: { id: string; username: string; avatar: string };
  player2: { id: string; username: string; avatar: string } | null;
  player1Score: number;
  player2Score: number;
  stakeAmount: string;
  potAmount: string;
  winnerId: string | null;
  startedAt: string | null;
  endedAt: string | null;
}

// ─── Socket Events ───────────────────────────────────
export interface ServerToClientEvents {
  // Matchmaking
  'match:found': (data: { matchId: string; opponent: { username: string; avatar: string; rating: number } }) => void;
  'match:cancelled': (data: { reason: string }) => void;

  // In-game sync
  'game:state': (data: GameStateSync) => void;
  'game:start': (data: { matchId: string; countdown: number }) => void;
  'game:score': (data: { player1Score: number; player2Score: number }) => void;
  'game:end': (data: { winnerId: string; player1Score: number; player2Score: number; earnings: string }) => void;
  'game:perk': (data: { playerId: string; perk: string }) => void;

  // Notifications
  'notification': (data: { type: string; message: string }) => void;
  'error': (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  // Matchmaking
  'matchmaking:join': (data: { stakeAmount: number; boardId: string }) => void;
  'matchmaking:cancel': () => void;

  // In-game
  'game:paddle': (data: { y: number; matchId: string }) => void;
  'game:perk': (data: { matchId: string; boardId: string }) => void;
  'game:ready': (data: { matchId: string }) => void;

  // Auth
  'auth': (data: { token: string }) => void;
}

export interface GameStateSync {
  ballX: number;
  ballY: number;
  ballVX: number;
  ballVY: number;
  paddle1Y: number;
  paddle2Y: number;
  player1Score: number;
  player2Score: number;
  timestamp: number;
}

// ─── Matchmaking Queue Entry ─────────────────────────
export interface QueueEntry {
  userId: string;
  username: string;
  avatar: string;
  rating: number;
  stakeAmount: number;
  boardId: string;
  joinedAt: number;
  socketId: string;
}
