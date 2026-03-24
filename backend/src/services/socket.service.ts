import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import { matchmakingQueue } from './matchmaking.service';
import * as matchService from './match.service';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { ClientToServerEvents, ServerToClientEvents, JwtPayload, QueueEntry } from '../types';

type AuthSocket = Socket<ClientToServerEvents, ServerToClientEvents> & { user?: JwtPayload };

let io: Server<ClientToServerEvents, ServerToClientEvents>;

// userId → socketId mapping
const onlineUsers = new Map<string, string>();
// matchId → { player1SocketId, player2SocketId }
const activeGames = new Map<string, { p1: string; p2: string }>();

export function initializeSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN.split(','),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 10000,
    pingTimeout: 5000,
    transports: ['websocket', 'polling'],
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
      next(new Error('Invalid or expired token'));
    }
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

    // ─── In-Game Events ────────────────────────────

    socket.on('game:ready', (data) => {
      const game = activeGames.get(data.matchId);
      if (!game) return;

      // Notify both players when both are ready
      socket.to(game.p1 === socket.id ? game.p2 : game.p1).emit('game:start', {
        matchId: data.matchId,
        countdown: 3,
      });
    });

    socket.on('game:paddle', (data) => {
      const game = activeGames.get(data.matchId);
      if (!game) return;

      // Relay paddle position to opponent
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
      const game = activeGames.get(data.matchId);
      if (!game) return;

      const opponentSocketId = game.p1 === socket.id ? game.p2 : game.p1;
      io.to(opponentSocketId).emit('game:perk', {
        playerId: user.userId,
        perk: data.boardId,
      });
    });

    // ─── Disconnect ────────────────────────────────

    socket.on('disconnect', () => {
      console.log(`🔌 ${user.username} disconnected`);
      onlineUsers.delete(user.userId);
      matchmakingQueue.leave(user.userId);

      // Handle mid-game disconnection
      for (const [matchId, game] of activeGames) {
        if (game.p1 === socket.id || game.p2 === socket.id) {
          const opponentSocketId = game.p1 === socket.id ? game.p2 : game.p1;
          io.to(opponentSocketId).emit('notification', {
            type: 'disconnect',
            message: 'Opponent disconnected. You win!',
          });
          activeGames.delete(matchId);
          break;
        }
      }
    });
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

    // Start match
    await prisma.match.update({
      where: { id: match.id },
      data: { status: 'IN_PROGRESS', startedAt: new Date() },
    });

    // Track active game
    activeGames.set(match.id, { p1: p1.socketId, p2: p2.socketId });

    // Notify both players
    const matchData = {
      matchId: match.id,
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
