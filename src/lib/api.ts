// ─────────────────────────────────────────────────────────
// Chain Pong — Frontend API Client
// ─────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://chain-pong-api.vercel.app/api';

// ─── Token Management ───────────────────────────────────

let accessToken: string | null = null;
let refreshToken: string | null = null;

function loadTokens() {
  if (typeof window === 'undefined') return;
  try {
    accessToken = localStorage.getItem('chainpong-access-token');
    refreshToken = localStorage.getItem('chainpong-refresh-token');
  } catch {}
}

function saveTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('chainpong-access-token', access);
    localStorage.setItem('chainpong-refresh-token', refresh);
  } catch {}
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('chainpong-access-token');
    localStorage.removeItem('chainpong-refresh-token');
  } catch {}
}

export function getAccessToken(): string | null {
  if (!accessToken) loadTokens();
  return accessToken;
}

// ─── HTTP Client ────────────────────────────────────────

// Dynamic timeouts: blockchain ops get 45s, match results 45s, auth/data 10s
const TIMEOUT_FAST = 10_000;       // Auth, leaderboard, profile, boards
const TIMEOUT_BLOCKCHAIN = 45_000; // Deposits, withdrawals, payouts, match results

function getTimeoutForEndpoint(endpoint: string): number {
  // Blockchain-heavy routes need longer timeouts to avoid state desync
  const slowRoutes = [
    '/player/sync-deposits',
    '/player/claim-earnings',
    '/player/withdraw',
    '/player/full-balance',
    '/matches/',              // match result submission, permit, claim-payout
  ];
  if (slowRoutes.some(r => endpoint.includes(r))) return TIMEOUT_BLOCKCHAIN;
  if (endpoint.includes('/result') || endpoint.includes('/claim') || endpoint.includes('/permit')) return TIMEOUT_BLOCKCHAIN;
  return TIMEOUT_FAST;
}

// Track whether a token refresh is already in-flight to prevent stampede
let refreshInFlight: Promise<boolean> | null = null;

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  _retryCount = 0
): Promise<{ success: boolean; data?: T; error?: string }> {
  if (!accessToken) loadTokens();

  // Pre-flight: refresh token if expiring within 5 minutes.
  // Users often spend 2-3 minutes in the MetaMask popup; a 60s buffer
  // causes tokens to expire before the post-tx API call lands.
  if (accessToken) {
    const exp = getTokenExpiry(accessToken);
    if (exp) {
      const nowSec = Math.floor(Date.now() / 1000);
      if (exp - nowSec < 300 && refreshToken) {
        await tryRefresh();
      }
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const timeoutMs = getTimeoutForEndpoint(endpoint);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // If 401, try refreshing token and retry ONCE
    if (res.status === 401 && refreshToken && _retryCount < 1) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        // Retry the original request with fresh token
        return request<T>(endpoint, options, _retryCount + 1);
      }
    }

    const json = await res.json();
    return json;
  } catch (err: any) {
    console.error(`API Error [${endpoint}]:`, err);
    // Blockchain routes: show "processing" instead of "failed" to prevent user panic
    if (err.name === 'AbortError' && timeoutMs === TIMEOUT_BLOCKCHAIN) {
      return { success: false, error: 'Transaction is still processing. Please check back shortly.' };
    }
    const message = err.name === 'AbortError' ? 'Request timed out' : (err.message || 'Network error');
    return { success: false, error: message };
  }
}

// ─── Token Preflight ────────────────────────────────────
// Decodes JWT exp claim and refreshes if within 60s of expiry.
// Call before any critical action (socket connect, matchmaking).

function getTokenExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload));
    return decoded.exp || null;
  } catch {
    return null;
  }
}

export async function ensureValidToken(): Promise<boolean> {
  if (!accessToken) loadTokens();
  // No token = local/fallback auth mode (no backend) — allow through
  if (!accessToken) return true;

  const exp = getTokenExpiry(accessToken);
  if (!exp) return !!accessToken; // Can't decode — let server reject if invalid

  const nowSec = Math.floor(Date.now() / 1000);
  const BUFFER_SEC = 300; // Refresh if within 5 minutes of expiry (MetaMask popup can take minutes)

  if (exp - nowSec < BUFFER_SEC) {
    console.log('[AUTH] Token expiring soon, refreshing...');
    if (refreshToken) {
      const ok = await tryRefresh();
      if (ok) {
        console.log('[AUTH] Token refreshed successfully');
        return true;
      }
      console.warn('[AUTH] Token refresh failed');
      return false;
    }
    return false;
  }

  return true;
}

async function tryRefresh(): Promise<boolean> {
  // Deduplicate: if a refresh is already in-flight, wait for it
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      if (!refreshToken) return false;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_FAST);
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const json = await res.json();
      if (json.success && json.data) {
        saveTokens(json.data.accessToken, json.data.refreshToken);
        return true;
      }
      // Server explicitly rejected the refresh token — clear tokens
      clearTokens();
      return false;
    } catch {
      // Network error during refresh — do NOT clear tokens.
      // The access token might still be valid, or we can retry later.
      console.warn('[AUTH] Token refresh network error — keeping existing tokens');
      return false;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

// ─── Auth API ───────────────────────────────────────────

export interface AuthResponse {
  user: {
    id: string;
    email: string | null;
    username: string;
    authMethod: string;
    walletAddress: string | null;
    gameWallet: string | null;
    avatar: string;
    createdAt: string;
    stats: {
      wins: number;
      losses: number;
      gamesPlayed: number;
      totalEarnings: string;
      totalLost: string;
      rating: number;
      winStreak: number;
      bestStreak: number;
    } | null;
  };
  accessToken: string;
  refreshToken: string;
}

export async function apiSignup(email: string, username: string, password: string, referralCode?: string) {
  const res = await request<AuthResponse>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, username, password, ...(referralCode ? { referralCode } : {}) }),
  });
  if (res.success && res.data) {
    saveTokens(res.data.accessToken, res.data.refreshToken);
  }
  return res;
}

export async function apiLogin(email: string, password: string) {
  const res = await request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (res.success && res.data) {
    saveTokens(res.data.accessToken, res.data.refreshToken);
  }
  return res;
}

export async function apiWalletAuth(walletAddress: string, signature: string, message: string, username?: string) {
  const res = await request<AuthResponse>('/auth/wallet', {
    method: 'POST',
    body: JSON.stringify({ walletAddress, signature, message, username }),
  });
  if (res.success && res.data) {
    saveTokens(res.data.accessToken, res.data.refreshToken);
  }
  return res;
}

export async function apiGetNonce(address: string) {
  return request<{ nonce: string; message: string }>(`/auth/nonce?address=${address}`);
}

export async function apiLogout() {
  const res = await request('/auth/logout', { method: 'POST' });
  clearTokens();
  return res;
}

// ─── Player API ─────────────────────────────────────────

export interface PlayerProfile {
  id: string;
  username: string;
  email: string | null;
  authMethod: string;
  walletAddress: string | null;
  gameWallet: string | null;
  avatar: string;
  createdAt: string;
  stats: {
    wins: number;
    losses: number;
    gamesPlayed: number;
    totalEarnings: string;
    totalLost: string;
    winStreak: number;
    bestStreak: number;
    rating: number;
    winRate: string;
  } | null;
  balance: string;
  boards: Array<{
    id: string;
    name: string;
    color: string;
    perk: string;
    perkIcon: string;
    rarity: string;
    purchasedAt: string;
  }>;
  recentMatches: Array<{
    id: string;
    mode: string;
    opponent: { username: string; avatar: string };
    won: boolean;
    myScore: number;
    opponentScore: number;
    stakeAmount: string;
    endedAt: string | null;
  }>;
}

export async function apiGetProfile() {
  return request<PlayerProfile>('/player/profile');
}

export async function apiUpdateProfile(updates: { username?: string; avatar?: string }) {
  return request('/player/profile', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function apiGetBalance() {
  return request<{ balance: string }>('/player/balance');
}

export async function apiGetOwnedBoards() {
  return request<Array<{ id: string; name: string; color: string; perk: string; perkIcon: string; rarity: string; price: string; purchasedAt: string }>>('/player/boards');
}

export async function apiPurchaseBoard(boardId: string, txHash?: string) {
  return request<{ boardId: string; boardName: string; message: string }>('/player/boards/purchase', {
    method: 'POST',
    body: JSON.stringify({ boardId, txHash }),
  });
}

export async function apiCreatePendingPurchase(boardId: string) {
  return request<{ pendingTxId: string; boardId: string; boardName: string; price: number }>('/player/boards/pending', {
    method: 'POST',
    body: JSON.stringify({ boardId }),
  });
}

export async function apiSyncPurchases(txHashes: string[]) {
  return request<{ reconciled: string[]; alreadyOwned: string[]; failed: string[] }>('/player/sync-purchases', {
    method: 'POST',
    body: JSON.stringify({ txHashes }),
  });
}

export async function apiGetClaimable() {
  return request<{ claimable: string }>('/player/claimable');
}

export async function apiClaimEarnings() {
  return request<{ txHash: string; amount: number }>('/player/claim-earnings', {
    method: 'POST',
  });
}

export async function apiWithdraw(amount: number, toAddress: string) {
  return request('/player/withdraw', {
    method: 'POST',
    body: JSON.stringify({ amount, toAddress }),
  });
}

export async function apiGetTransactions(page = 1, limit = 20) {
  return request(`/player/transactions?page=${page}&limit=${limit}`);
}

// ─── Leaderboard API ────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatar: string;
  wins: number;
  losses: number;
  earnings: string;
  winStreak: number;
  rating: number;
  isYou: boolean;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total: number;
  page: number;
  totalPages: number;
}

export async function apiGetLeaderboard(page = 1, limit = 50, sortBy: 'wins' | 'earnings' | 'rating' = 'wins') {
  return request<LeaderboardResponse>(`/leaderboard?page=${page}&limit=${limit}&sortBy=${sortBy}`);
}

export async function apiGetTopPlayers(limit = 5) {
  return request<LeaderboardEntry[]>(`/leaderboard/top?limit=${limit}`);
}

export async function apiGetPlayerRank(userId: string) {
  return request<{ rank: number }>(`/leaderboard/rank/${userId}`);
}

// ─── Match API ──────────────────────────────────────────

export async function apiCreateMatch(mode: 'PVP' | 'COMPUTER', boardId: string, stakeAmount = 0, difficulty?: 'EASY' | 'MEDIUM' | 'HARD') {
  return request('/matches', {
    method: 'POST',
    body: JSON.stringify({ mode, boardId, stakeAmount, difficulty }),
  });
}

export async function apiJoinMatch(matchId: string, boardId: string) {
  return request(`/matches/${matchId}/join`, {
    method: 'POST',
    body: JSON.stringify({ boardId }),
  });
}

export async function apiSubmitResult(
  matchId: string,
  player1Score: number,
  player2Score: number,
  perkUsed = false,
  tickLog?: unknown[],
  tickHash?: string
) {
  return request(`/matches/${matchId}/result`, {
    method: 'POST',
    body: JSON.stringify({ player1Score, player2Score, perkUsed, tickLog, tickHash }),
  });
}

export async function apiCancelMatch(matchId: string) {
  return request(`/matches/${matchId}/cancel`, { method: 'POST' });
}

export async function apiGetMatch(matchId: string) {
  return request(`/matches/${matchId}`);
}

export async function apiGetMatchHistory(page = 1, limit = 20) {
  return request(`/matches?page=${page}&limit=${limit}`);
}

export async function apiGetAvailableMatches(stakeAmount = 0.002) {
  return request(`/matches/available?stakeAmount=${stakeAmount}`);
}

// ─── Boards API ─────────────────────────────────────────

export interface BoardData {
  id: string;
  name: string;
  price: string;
  color: string;
  gradient: string;
  perk: string;
  perkDescription: string;
  perkIcon: string;
  rarity: string;
}

export async function apiGetAllBoards() {
  return request<BoardData[]>('/boards');
}

export async function apiGetBoard(id: string) {
  return request<BoardData>(`/boards/${id}`);
}

// ─── Password Reset ─────────────────────────────────────

export async function apiRequestPasswordReset(email: string) {
  return request<{ message: string }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function apiResetPassword(token: string, newPassword: string) {
  return request<{ message: string }>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
}

export async function apiRecoverWallet(seedPhrase: string) {
  return request<{ message: string; address: string }>('/auth/recover-wallet', {
    method: 'POST',
    body: JSON.stringify({ seedPhrase }),
  });
}

// ─── Social Links ─────────────────────────────────────

export interface SocialLinks {
  xHandle: string | null;
  farcasterName: string | null;
  telegramUser: string | null;
}

export async function apiGetSocials() {
  return request<SocialLinks>('/player/socials');
}

export async function apiUpdateSocials(updates: Partial<SocialLinks>) {
  return request<SocialLinks>('/player/socials', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

// ─── Wallet Export ─────────────────────────────────────

export async function apiExportKey() {
  return request<{ address: string; privateKey: string; warning: string }>('/player/export-key');
}

// ─── Blockchain / Deposits ─────────────────────────────

export async function apiSyncDeposits() {
  return request<{ newDeposit: boolean; depositAmount: string; onChainBalance: string; gameBalance: string }>('/player/sync-deposits', {
    method: 'POST',
  });
}

export async function apiGetFullBalance() {
  return request<{ gameBalance: string; onChainBalance: string }>('/player/full-balance');
}

// ─── Health Check ───────────────────────────────────────

export async function apiHealthCheck() {
  return request<{ status: string; version: string; onlinePlayers: number }>('/health');
}
