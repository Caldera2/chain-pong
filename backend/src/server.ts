import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';

import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { errorHandler } from './middleware/errorHandler';
import { initializeSocket, getOnlineCount } from './services/socket.service';
import { auditSecretSafety } from './middleware/security';
import { treasuryGuard } from './services/treasury.guard';

// Routes
import authRoutes from './routes/auth.routes';
import playerRoutes from './routes/player.routes';
import matchRoutes from './routes/match.routes';
import leaderboardRoutes from './routes/leaderboard.routes';
import boardsRoutes from './routes/boards.routes';

// ─────────────────────────────────────────────────────────
// Express App
// ─────────────────────────────────────────────────────────

const app = express();
const httpServer = createServer(app);

// ─── Security Headers (Hardened) ─────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://sepolia.base.org', 'wss:'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  noSniff: true,
  xssFilter: true,
}));

// ─── CORS (Strict in production) ─────────────────────
// In production, ONLY accepts requests from the specific
// frontend URL. All other origins are rejected.
const corsOrigins = env.NODE_ENV === 'development'
  ? true
  : env.CORS_ORIGIN.split(',').map(o => o.trim());

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // Preflight cache: 24 hours
}));

// ─── Body Parsing ────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── Rate Limiting ───────────────────────────────────
const limiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later' },
});
app.use('/api', limiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per window
  message: { success: false, error: 'Too many authentication attempts' },
});
app.use('/api/auth', authLimiter);

// ─── Health Check ────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      version: '1.0.0',
      environment: env.NODE_ENV,
      uptime: Math.floor(process.uptime()),
      onlinePlayers: getOnlineCount(),
      treasury: treasuryGuard.getStatus(),
      timestamp: new Date().toISOString(),
    },
  });
});

// ─── API Routes ──────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/player', playerRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/boards', boardsRoutes);

// ─── 404 ─────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// ─── Error Handler ───────────────────────────────────
app.use(errorHandler);

// ─── WebSocket (only for local dev — Vercel doesn't support persistent connections) ───
if (!process.env.VERCEL) {
  initializeSocket(httpServer);
}

// ─────────────────────────────────────────────────────────
// Start Server (only when running locally, NOT on Vercel)
// ─────────────────────────────────────────────────────────

if (!process.env.VERCEL) {
  async function start() {
    await connectDatabase();

    // Run security audit on startup
    auditSecretSafety();

    // Check treasury balance on boot
    treasuryGuard.checkBalance().catch(() => {});

    httpServer.listen(env.PORT, () => {
      console.log(`
╔═══════════════════════════════════════════════╗
║                                               ║
║   🏓 Chain Pong API Server                    ║
║                                               ║
║   Port:        ${String(env.PORT).padEnd(30)}║
║   Environment: ${env.NODE_ENV.padEnd(30)}║
║   Database:    Connected                      ║
║   WebSocket:   Active                         ║
║                                               ║
╚═══════════════════════════════════════════════╝
      `);
    });
  }

  // ─── Graceful Shutdown ───────────────────────────────
  async function shutdown(signal: string) {
    console.log(`\n⚡ ${signal} received. Shutting down gracefully...`);
    httpServer.close(async () => {
      await disconnectDatabase();
      console.log('👋 Server stopped');
      process.exit(0);
    });

    setTimeout(() => {
      console.error('❌ Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    console.error('🔥 Unhandled rejection:', reason);
  });

  start().catch((err) => {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  });
}

export default app;
