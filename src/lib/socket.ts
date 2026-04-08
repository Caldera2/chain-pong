// ─────────────────────────────────────────────────────────
// Chain Pong — Socket.IO Client for Real-time PvP
// ─────────────────────────────────────────────────────────

import { io, Socket } from 'socket.io-client';
import { getAccessToken, ensureValidToken } from './api';

// Socket URL — enforce wss:// when page is served over https:// to avoid mixed-content blocks.
const RAW_SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, '') || 'http://localhost:4000';
const SOCKET_URL = (() => {
  let url = RAW_SOCKET_URL.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    url = url.replace(/^http:\/\//, 'https://');
  }
  return url;
})();

let socket: Socket | null = null;

// Callback for auth errors — frontend can hook into this
let onAuthErrorCallback: (() => void) | null = null;

// Exponential backoff state for auth reconnection
let authRetryCount = 0;
const MAX_AUTH_RETRIES = 5;

// Track the last failed event so we can replay it after re-auth
let lastFailedEvent: { name: string; data: any } | null = null;

export function setOnAuthError(callback: () => void) {
  onAuthErrorCallback = callback;
}

export function getSocket(): Socket | null {
  return socket;
}

// Check if the Zustand store has a transaction in progress
// (imported lazily to avoid circular deps)
function isTransactionInProgress(): boolean {
  try {
    const stored = localStorage.getItem('chainpong-pending-txs');
    if (stored) {
      const txs = JSON.parse(stored);
      if (Array.isArray(txs) && txs.length > 0) return true;
    }
  } catch {}
  return false;
}

async function handleAuthReconnect(): Promise<boolean> {
  if (authRetryCount >= MAX_AUTH_RETRIES) {
    console.warn(`[SOCKET] Max auth retries (${MAX_AUTH_RETRIES}) reached`);
    // Only trigger auth error callback if no transaction is in progress
    if (!isTransactionInProgress()) {
      onAuthErrorCallback?.();
    }
    return false;
  }

  // Exponential backoff: 1s, 2s, 4s, 8s, 16s
  const delay = Math.min(1000 * Math.pow(2, authRetryCount), 16_000);
  authRetryCount++;
  console.log(`[SOCKET] Auth retry ${authRetryCount}/${MAX_AUTH_RETRIES} in ${delay}ms...`);

  await new Promise(r => setTimeout(r, delay));

  const refreshed = await ensureValidToken();
  if (refreshed) {
    const newToken = getAccessToken();
    if (socket && newToken) {
      socket.auth = { token: newToken };
      socket.connect();
      return true;
    }
  }
  return false;
}

export async function connectSocket(): Promise<Socket> {
  if (socket?.connected) return socket;

  // Pre-flight: ensure token is fresh before connecting
  const tokenValid = await ensureValidToken();
  const token = getAccessToken();
  if (!token || !tokenValid) {
    throw new Error('No valid access token — must be logged in to connect');
  }

  // Reset retry counter on fresh connection
  authRetryCount = 0;

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });

  socket.on('connect', () => {
    console.log('[SOCKET] Connected:', socket?.id);
    authRetryCount = 0; // Reset on successful connect

    // Replay last failed event if we reconnected after an auth error
    if (lastFailedEvent && socket) {
      console.log(`[SOCKET] Replaying failed event: ${lastFailedEvent.name}`);
      socket.emit(lastFailedEvent.name as any, lastFailedEvent.data);
      lastFailedEvent = null;
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('[SOCKET] Disconnected:', reason);
  });

  socket.on('connect_error', async (err) => {
    console.error('[SOCKET] Connection error:', err.message);

    // If auth error, try silent re-auth with exponential backoff
    if (err.message.includes('expired') || err.message.includes('Invalid') || err.message.includes('auth_error') || err.message.includes('Authentication')) {
      console.log('[SOCKET] Auth error detected — starting backoff reconnection...');
      await handleAuthReconnect();
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
    // Only trigger auth error callback if no transaction is processing
    if (!isTransactionInProgress()) {
      onAuthErrorCallback?.();
    }
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
