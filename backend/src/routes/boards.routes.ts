import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';

const router = Router();

// ─────────────────────────────────────────────────────────
// GET /api/boards — List all available boards
// ─────────────────────────────────────────────────────────
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const boards = await prisma.board.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
    });

    res.json({
      success: true,
      data: boards.map((b) => ({
        id: b.id,
        name: b.name,
        price: b.price.toString(),
        color: b.color,
        gradient: b.gradient,
        perk: b.perk,
        perkDescription: b.perkDescription,
        perkIcon: b.perkIcon,
        rarity: b.rarity,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/boards/:id — Get a single board
// ─────────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const board = await prisma.board.findUnique({
      where: { id: String(req.params.id) },
    });

    if (!board) {
      res.status(404).json({ success: false, error: 'Board not found' });
      return;
    }

    res.json({
      success: true,
      data: {
        ...board,
        price: board.price.toString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
