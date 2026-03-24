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

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  if (!accessToken) loadTokens();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  try {
    let res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    // If 401, try refreshing token
    if (res.status === 401 && refreshToken) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${accessToken}`;
        res = await fetch(`${API_BASE}${endpoint}`, {
          ...options,
          headers,
        });
      }
    }

    const json = await res.json();
    return json;
  } catch (err: any) {
    console.error(`API Error [${endpoint}]:`, err);
    return { success: false, error: err.message || 'Network error' };
  }
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const json = await res.json();
    if (json.success && json.data) {
      saveTokens(json.data.accessToken, json.data.refreshToken);
      return true;
    }
  } catch {}
  clearTokens();
  return false;
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

export async function apiSignup(email: string, username: string, password: string) {
  const res = await request<AuthResponse>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, username, password }),
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

export async function apiSubmitResult(matchId: string, player1Score: number, player2Score: number, perkUsed = false) {
  return request(`/matches/${matchId}/result`, {
    method: 'POST',
    body: JSON.stringify({ player1Score, player2Score, perkUsed }),
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
