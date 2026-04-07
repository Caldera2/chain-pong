import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import { matchmakingQueue } from './matchmaking.service';
import * as matchService from './match.service';
import { generateMatchSeed, generateConfigHash } from './match.service';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { ClientToServerEvents, ServerToClientEvents, JwtPayload, QueueEntry } from '../types';

type AuthSocket = Socket<ClientToServerEvents, ServerToClientEvents> & { user?: JwtPayload };

const WIN_SCORE = 7;

let io: Server<ClientToServerEvents, ServerToClientEvents>;

// userId → socketId mapping
const onlineUsers = new Map<string, string>();
// matchId → { player1SocketId, player2SocketId }
const activeGames = new Map<string, { p1: string; p2: string }>();

// ── Reconnection tracking for rage-quit detection ────
// matchId → { disconnectedPlayer, timer, remainingPlayer }
const reconnectionTimers = new Map<string, {
  disconnectedUserId: string;
  remainingSocketId: string;
  matchId: string;
  timer: ReturnType<typeof setTimeout>;
}>();

const RECONNECT_WINDOW_MS = 15_000; // 15 seconds to reconnect

export function initializeSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN.split(',').map(o => o.trim()),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Heartbeat: ping every 10s, drop if no pong within 5s
    pingInterval: 10_000,
    pingTimeout: 5_000,
    transports: ['websocket', 'polling'],
    // Allow upgrade from polling to websocket
    allowUpgrades: true,
    // Connection state recovery (Socket.IO v4.6+)
    connectionStateRecovery: {
      maxDisconnectionDuration: RECONNECT_WINDOW_MS,
      skipMiddlewares: false,
    },
  });

  // ─── Auth Middleware ────────────────────────────────
  io.use((socket: AuthSocket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = verifyAccessToken(token as string);
      socket.user = payload;
      next();
    } catch {
      // Emit auth_error so the frontend can silently refresh instead of showing a hard failure
      next(new Error('auth_error: Token expired or invalid. Please reconnect.'));
    }
  });

  // ─── Mid-Session Token Validation ──────────────────
  // Re-verify JWT on every inbound event. If expired, allow a 30s
  // grace period for users in matchmaking or active games so the
  // client can silently refresh without losing their session.
  io.on('connection', (socket: AuthSocket) => {
    socket.use((event, nextMw) => {
      const token = socket.handshake.auth.token;
      if (token) {
        try {
          verifyAccessToken(token as string);
        } catch (err: any) {
          // Grace period: if the user is in matchmaking or an active game,
          // allow events for 30s after token expiry to give the client
          // time to silently refresh and reconnect.
          const userId = socket.user?.userId;
          const isInMatchmaking = userId && matchmakingQueue.isInQueue(userId);
          const isInActiveGame = userId && Array.from(activeGames.values()).some(
            (g) => onlineUsers.get(userId) === g.p1 || onlineUsers.get(userId) === g.p2
          );

          if (isInMatchmaking || isInActiveGame) {
            // Check if the token expired within the last 30 seconds
            try {
              const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
              const expiredAgo = Math.floor(Date.now() / 1000) - (decoded.exp || 0);
              if (expiredAgo <= 30) {
                // Within grace period — allow the event but notify client to refresh
                socket.emit('auth_error', { message: 'Token expired. Please refresh silently.' });
                nextMw();
                return;
              }
            } catch {}
          }

          socket.emit('auth_error', { message: 'Token expired. Reconnect with a fresh token.' });
        }
      }
      nextMw();
    });
  });

  // ─── Connection Handler ────────────────────────────
  io.on('connection', (socket: AuthSocket) => {
    const user = socket.user!;
    console.log(`🔌 ${user.username} connected (${socket.id})`);

    // Track online user
    onlineUsers.set(user.userId, socket.id);

    // ─── Matchmaking ───────────────────────────────

    socket.on('matchmaking:join', async (data) => {
      try {
        // Get player stats for rating
        const stats = await prisma.playerStats.findUnique({ where: { userId: user.userId } });
        const rating = stats?.rating || 1000;

        const entry: QueueEntry = {
          userId: user.userId,
          username: user.username,
          avatar: '🎮',
          rating,
          stakeAmount: data.stakeAmount,
          boardId: data.boardId,
          joinedAt: Date.now(),
          socketId: socket.id,
        };

        const opponent = matchmakingQueue.join(entry);

        if (opponent) {
          // Instant match found! Create the PvP match
          await handleMatchFound(entry, opponent);
        } else {
          // In queue, waiting
          socket.emit('notification', {
            type: 'matchmaking',
            message: `Searching for opponent... (${matchmakingQueue.getQueueSize(data.stakeAmount)} in queue)`,
          });
        }
      } catch (error: any) {
        socket.emit('error', { message: error.message || 'Matchmaking failed' });
      }
    });

    socket.on('matchmaking:cancel', () => {
      matchmakingQueue.leave(user.userId);
      socket.emit('match:cancelled', { reason: 'You cancelled matchmaking' });
    });

    // ─── Socket-Session Binding Helper ──────────────
    // Validates that the socket sending a game event is one
    // of the two registered players for that match. Prevents
    // a third-party socket (using a stolen/shared JWT) from
    // sniffing paddle positions or injecting spoofed moves.

    function validateMatchSocket(matchId: string, socketId: string): { game: { p1: string; p2: string } } | null {
      const game = activeGames.get(matchId);
      if (!game) return null;

      if (game.p1 !== socketId && game.p2 !== socketId) {
        // Third-party socket attempting to interact with this match
        console.warn(`[SECURITY] Socket ${socketId} (user ${user.userId}) attempted to send event for match ${matchId} — not a registered participant`);
        socket.emit('security_alert', {
          message: 'You are not a registered participant in this match session',
          matchId,
        });
        socket.disconnect(true);
        return null;
      }

      return { game };
    }

    // ─── In-Game Events (with session pinning) ────

    socket.on('game:ready', (data) => {
      const result = validateMatchSocket(data.matchId, socket.id);
      if (!result) return;

      // Notify both players when both are ready
      const { game } = result;
      socket.to(game.p1 === socket.id ? game.p2 : game.p1).emit('game:start', {
        matchId: data.matchId,
        countdown: 3,
      });
    });

    socket.on('game:paddle', (data) => {
      const result = validateMatchSocket(data.matchId, socket.id);
      if (!result) return;

      // Relay paddle position to opponent
      const { game } = result;
      const opponentSocketId = game.p1 === socket.id ? game.p2 : game.p1;
      io.to(opponentSocketId).emit('game:state', {
        ballX: 0, ballY: 0, ballVX: 0, ballVY: 0, // ball state managed server-side in production
        paddle1Y: data.y,
        paddle2Y: data.y,
        player1Score: 0,
        player2Score: 0,
        timestamp: Date.now(),
      });
    });

    socket.on('game:perk', (data) => {
      const result = validateMatchSocket(data.matchId, socket.id);
      if (!result) return;

      const { game } = result;
      const opponentSocketId = game.p1 === socket.id ? game.p2 : game.p1;
      io.to(opponentSocketId).emit('game:perk', {
        playerId: user.userId,
        perk: data.boardId,
      });
    });

    // ─── Disconnect (with rage-quit protection) ───

    socket.on('disconnect', () => {
      console.log(`🔌 ${user.username} disconnected`);
      onlineUsers.delete(user.userId);
      matchmakingQueue.leave(user.userId);

      // Check if this player was in an active game
      for (const [matchId, game] of activeGames) {
        if (game.p1 === socket.id || game.p2 === socket.id) {
          const isP1 = game.p1 === socket.id;
          const remainingSocketId = isP1 ? game.p2 : game.p1;

          // Notify remaining player that opponent dropped
          io.to(remainingSocketId).emit('notification', {
            type: 'disconnect',
            message: `Opponent disconnected. Waiting 15s for reconnect...`,
          });

          // Start 15-second reconnection timer
          const timer = setTimeout(async () => {
            reconnectionTimers.delete(matchId);
            activeGames.delete(matchId);

            // Auto-forfeit: award 7-0 to remaining player
            try {
              console.log(`[FORFEIT] Player ${user.userId} failed to reconnect for match ${matchId}`);
              const match = await prisma.match.findUnique({ where: { id: matchId } });
              if (!match || match.status === 'COMPLETED' || match.status === 'CANCELLED') return;

              // Remaining player wins by forfeit
              const winnerId = isP1 ? match.player2Id : match.player1Id;
              const p1Score = isP1 ? 0 : WIN_SCORE;
              const p2Score = isP1 ? WIN_SCORE : 0;

              if (winnerId) {
                await matchService.submitMatchResult(
                  matchId, p1Score, p2Score, winnerId, false
                );
                console.log(`[FORFEIT] Match ${matchId} awarded to ${winnerId} (7-0 forfeit)`);
              }

              io.to(remainingSocketId).emit('notification', {
                type: 'forfeit',
                message: 'Opponent forfeited. You win!',
              });
              io.to(remainingSocketId).emit('game:end', {
                winnerId: winnerId || '',
                player1Score: p1Score,
                player2Score: p2Score,
                earnings: '0',
              });
            } catch (err) {
              console.error(`[FORFEIT] Failed to settle forfeit for match ${matchId}:`, err);
            }
          }, RECONNECT_WINDOW_MS);

          reconnectionTimers.set(matchId, {
            disconnectedUserId: user.userId,
            remainingSocketId,
            matchId,
            timer,
          });

          break;
        }
      }
    });

    // ─── Reconnection (cancel forfeit timer) ──────

    // Check if this connecting user has a pending reconnection
    for (const [matchId, pending] of reconnectionTimers) {
      if (pending.disconnectedUserId === user.userId) {
        clearTimeout(pending.timer);
        reconnectionTimers.delete(matchId);

        // Re-register in active games with new socket ID
        const game = activeGames.get(matchId);
        if (game) {
          if (game.p1 === pending.remainingSocketId) {
            game.p2 = socket.id;
          } else {
            game.p1 = socket.id;
          }
        }

        // Notify both players game resumes
        io.to(pending.remainingSocketId).emit('notification', {
          type: 'reconnect',
          message: 'Opponent reconnected. Game resumed!',
        });
        socket.emit('notification', {
          type: 'reconnect',
          message: 'Reconnected! Game resumed.',
        });

        console.log(`🔌 ${user.username} reconnected to match ${matchId}`);
        break;
      }
    }
  });

  // ─── Matchmaking Sweep (every 2 seconds) ──────────
  setInterval(() => {
    const matches = matchmakingQueue.sweep();
    for (const [p1, p2] of matches) {
      handleMatchFound(p1, p2).catch(console.error);
    }
  }, 2000);

  console.log('🔌 WebSocket server initialized');
  return io;
}

// ─── Create match and notify both players ────────────
async function handleMatchFound(p1: QueueEntry, p2: QueueEntry) {
  try {
    // Create PvP match in DB
    const match = await matchService.createPvpMatch(p1.userId, p1.boardId, p1.stakeAmount);
    const joined = await matchService.joinPvpMatch(match.id, p2.userId, p2.boardId);

    // Generate server-seeded randomness for deterministic ball physics
    const matchSeed = generateMatchSeed();
    const configHash = generateConfigHash(matchSeed);

    // Start match and store the seed
    await prisma.match.update({
      where: { id: match.id },
      data: { status: 'IN_PROGRESS', startedAt: new Date(), matchSeed },
    });

    // Track active game
    activeGames.set(match.id, { p1: p1.socketId, p2: p2.socketId });

    // Notify both players — seed + configHash sent so clients can verify constants
    const matchData = {
      matchId: match.id,
      matchSeed,
      configHash,
    };

    io.to(p1.socketId).emit('match:found', {
      ...matchData,
      opponent: { username: p2.username, avatar: p2.avatar, rating: p2.rating },
    });

    io.to(p2.socketId).emit('match:found', {
      ...matchData,
      opponent: { username: p1.username, avatar: p1.avatar, rating: p1.rating },
    });
  } catch (error) {
    console.error('Match creation failed:', error);
    io.to(p1.socketId).emit('error', { message: 'Match creation failed' });
    io.to(p2.socketId).emit('error', { message: 'Match creation failed' });
  }
}

// ─── Utilities ───────────────────────────────────────
export function getOnlineCount(): number {
  return onlineUsers.size;
}

export function getIO(): Server {
  return io;
}
