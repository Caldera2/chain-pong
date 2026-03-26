import { Router, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth';
import { validateMatchResultRequest } from '../middleware/security';
import * as matchService from '../services/match.service';
import { createMatchSchema, submitResultSchema } from '../utils/validators';
import { AuthRequest } from '../types';

const router = Router();

// ─── Payout Rate Limiter ─────────────────────────────────
// Extra-strict rate limit for payout-related endpoints to
// prevent abuse. 5 claims per 15 minutes per IP.
const payoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many payout attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─────────────────────────────────────────────────────────
// POST /api/matches — Create a new match
// ─────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { mode, stakeAmount, boardId, difficulty } = createMatchSchema.parse(req.body);
    const userId = req.user!.userId;

    let match;
    if (mode === 'COMPUTER') {
      match = await matchService.createComputerMatch(userId, boardId, difficulty || 'MEDIUM');
    } else {
      match = await matchService.createPvpMatch(userId, boardId, stakeAmount);
    }

    res.status(201).json({ success: true, data: match });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/matches/:id/join — Join an existing PvP match
// ─────────────────────────────────────────────────────────
router.post('/:id/join', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { boardId } = req.body;
    if (!boardId) {
      res.status(400).json({ success: false, error: 'boardId is required' });
      return;
    }

    const match = await matchService.joinPvpMatch(String(req.params.id), req.user!.userId, boardId);
    res.json({ success: true, data: match });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/matches/:id/result — Submit match result
//
// Returns the completed match + a signed payoutToken.
// The auto-payout runs immediately, but if it fails the
// frontend can retry via POST /api/matches/:id/claim-payout.
// ─────────────────────────────────────────────────────────
router.post('/:id/result', requireAuth, validateMatchResultRequest, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = submitResultSchema.parse({ ...req.body, matchId: String(req.params.id) });
    const result = await matchService.submitMatchResult(
      body.matchId,
      body.player1Score,
      body.player2Score,
      req.user!.userId,
      body.perkUsed
    );

    // result includes { ...matchData, payoutToken }
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/matches/:id/claim-payout — Claim winnings
//
// Two-step payout flow:
// 1. submitMatchResult declares winner → returns signed payoutToken
// 2. Frontend presents payoutToken here → triggers blockchain transfer
//
// This endpoint is idempotent — calling it twice for the same
// match will NOT double-pay (payout.service checks DB first).
// ─────────────────────────────────────────────────────────
router.post('/:id/claim-payout', requireAuth, payoutLimiter, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { payoutToken } = req.body;
    if (!payoutToken) {
      res.status(400).json({ success: false, error: 'payoutToken is required' });
      return;
    }

    const result = await matchService.claimPayout(payoutToken, req.user!.userId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/matches/:id/cancel — Cancel a pending match
// ─────────────────────────────────────────────────────────
router.post('/:id/cancel', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const match = await matchService.cancelMatch(String(req.params.id), req.user!.userId);
    res.json({ success: true, data: match });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/matches/:id — Get match details
// ─────────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const match = await matchService.getMatch(String(req.params.id));
    res.json({ success: true, data: match });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/matches — Get match history for current user
// ─────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(String(req.query.page)) || 1;
    const limit = Math.min(parseInt(String(req.query.limit)) || 20, 100);
    const result = await matchService.getMatchHistory(req.user!.userId, page, limit);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/matches/available — Find available PvP matches
// ─────────────────────────────────────────────────────────
router.get('/available', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const stakeAmount = parseFloat(String(req.query.stakeAmount)) || 0.002;
    const matches = await matchService.findAvailableMatches(stakeAmount, req.user!.userId);
    res.json({ success: true, data: matches });
  } catch (error) {
    next(error);
  }
});

export default router;
