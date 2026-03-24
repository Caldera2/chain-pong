import { Router, Response, NextFunction } from 'express';
import { optionalAuth } from '../middleware/auth';
import * as leaderboardService from '../services/leaderboard.service';
import { leaderboardQuerySchema } from '../utils/validators';
import { AuthRequest } from '../types';

const router = Router();

// ─────────────────────────────────────────────────────────
// GET /api/leaderboard — Full leaderboard (paginated)
// ─────────────────────────────────────────────────────────
router.get('/', optionalAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { page, limit, sortBy } = leaderboardQuerySchema.parse(req.query);
    const result = await leaderboardService.getLeaderboard(page, limit, sortBy, req.user?.userId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/leaderboard/top — Top 5 for mini-leaderboard
// ─────────────────────────────────────────────────────────
router.get('/top', optionalAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit)) || 5, 20);
    const entries = await leaderboardService.getTopPlayers(limit, req.user?.userId);
    res.json({ success: true, data: entries });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/leaderboard/rank/:userId — Get specific player rank
// ─────────────────────────────────────────────────────────
router.get('/rank/:userId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const rank = await leaderboardService.getPlayerRank(String(req.params.userId));
    res.json({ success: true, data: { rank } });
  } catch (error) {
    next(error);
  }
});

export default router;
