// ─────────────────────────────────────────────────────────
// Chain Pong — Socket.IO Client for Real-time PvP
// ─────────────────────────────────────────────────────────

import { io, Socket } from 'socket.io-client';
import { getAccessToken, ensureValidToken } from './api';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';

let socket: Socket | null = null;

// Callback for auth errors — frontend can hook into this
let onAuthErrorCallback: (() => void) | null = null;

export function setOnAuthError(callback: () => void) {
  onAuthErrorCallback = callback;
}

export function getSocket(): Socket | null {
  return socket;
}

export async function connectSocket(): Promise<Socket> {
  if (socket?.connected) return socket;

  // Pre-flight: ensure token is fresh before connecting
  const tokenValid = await ensureValidToken();
  const token = getAccessToken();
  if (!token || !tokenValid) {
    throw new Error('No valid access token — must be logged in to connect');
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('🔌 Socket connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('🔌 Socket disconnected:', reason);
  });

  socket.on('connect_error', async (err) => {
    console.error('🔌 Socket connection error:', err.message);

    // If auth error, try silent re-login
    if (err.message.includes('expired') || err.message.includes('Invalid') || err.message.includes('Authentication')) {
      console.log('[SOCKET] Auth error detected — attempting silent token refresh...');
      const refreshed = await ensureValidToken();
      if (refreshed) {
        const newToken = getAccessToken();
        if (socket && newToken) {
          socket.auth = { token: newToken };
          socket.connect(); // Reconnect with fresh token
          return;
        }
      }
      // Refresh failed — notify frontend to handle re-login
      onAuthErrorCallback?.();
    }
  });

  // Listen for server-emitted auth_error (explicit token rejection mid-session)
  socket.on('auth_error' as any, async (data: { message: string }) => {
    console.warn('[SOCKET] Server auth_error:', data.message);
    const refreshed = await ensureValidToken();
    if (refreshed) {
      const newToken = getAccessToken();
      if (socket && newToken) {
        socket.auth = { token: newToken };
        socket.disconnect().connect();
        return;
      }
    }
    onAuthErrorCallback?.();
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// ─── Matchmaking ────────────────────────────────────────

export async function joinMatchmaking(stakeAmount: number, boardId: string) {
  const s = await connectSocket();
  s.emit('matchmaking:join', { stakeAmount, boardId });
}

export function cancelMatchmaking() {
  socket?.emit('matchmaking:cancel');
}

// ─── In-Game Events ─────────────────────────────────────

export function sendPaddlePosition(matchId: string, y: number) {
  socket?.emit('game:paddle', { matchId, y });
}

export function sendPerkActivation(matchId: string, boardId: string) {
  socket?.emit('game:perk', { matchId, boardId });
}

export function sendReady(matchId: string) {
  socket?.emit('game:ready', { matchId });
}

// ─── Event Listeners ────────────────────────────────────

export function onMatchFound(callback: (data: { matchId: string; opponent: { username: string; avatar: string; rating: number } }) => void) {
  socket?.on('match:found', callback);
  return () => { socket?.off('match:found', callback); };
}

export function onMatchCancelled(callback: (data: { reason: string }) => void) {
  socket?.on('match:cancelled', callback);
  return () => { socket?.off('match:cancelled', callback); };
}

export function onGameState(callback: (data: any) => void) {
  socket?.on('game:state', callback);
  return () => { socket?.off('game:state', callback); };
}

export function onGameStart(callback: (data: { matchId: string; countdown: number }) => void) {
  socket?.on('game:start', callback);
  return () => { socket?.off('game:start', callback); };
}

export function onGameScore(callback: (data: { player1Score: number; player2Score: number }) => void) {
  socket?.on('game:score', callback);
  return () => { socket?.off('game:score', callback); };
}

export function onGameEnd(callback: (data: { winnerId: string; player1Score: number; player2Score: number; earnings: string }) => void) {
  socket?.on('game:end', callback);
  return () => { socket?.off('game:end', callback); };
}

export function onPerkUsed(callback: (data: { playerId: string; perk: string }) => void) {
  socket?.on('game:perk', callback);
  return () => { socket?.off('game:perk', callback); };
}

export function onDepositConfirmed(callback: (data: { amount: string; txHash: string; newBalance: string | null }) => void) {
  socket?.on('deposit_confirmed', callback);
  return () => { socket?.off('deposit_confirmed', callback); };
}

export function onPurchaseConfirmed(callback: (data: { txHash: string; amount: string }) => void) {
  socket?.on('purchase_confirmed', callback);
  return () => { socket?.off('purchase_confirmed', callback); };
}

export function onNotification(callback: (data: { type: string; message: string }) => void) {
  socket?.on('notification', callback);
  return () => { socket?.off('notification', callback); };
}

export function onError(callback: (data: { message: string }) => void) {
  socket?.on('error', callback);
  return () => { socket?.off('error', callback); };
}
