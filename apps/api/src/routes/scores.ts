import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { computeAndSaveScore, getLatestScore, getScoreHistory } from '../services/scoringService';
import { prisma } from '../lib/prisma';
import { z } from 'zod';

const router = Router();

// GET /api/scores/:userId
router.get('/:userId', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;

  // Employees can only see their own scores
  if (req.user.role === 'employee' && req.user.sub !== userId) {
    res.status(403).json({ success: false, error: 'You can only view your own scores' });
    return;
  }

  const latest = await getLatestScore(userId);
  const history = await getScoreHistory(userId);

  res.json({ success: true, data: { latest, history } });
});

// GET /api/scores — summary of all users (authority only)
router.get(
  '/',
  authenticate,
  requireRole('mother', 'father'),
  async (_req: Request, res: Response): Promise<void> => {
    const users = await prisma.user.findMany({
      where: { role: 'employee' },
      select: { id: true, name: true, specialty: true },
    });

    const summaries = await Promise.all(
      users.map(async (user) => {
        const latest = await getLatestScore(user.id);
        return { ...user, latestScore: latest };
      })
    );

    res.json({ success: true, data: { summaries } });
  }
);

// POST /api/scores/compute — trigger recomputation (authority only)
router.post(
  '/compute',
  authenticate,
  requireRole('mother', 'father'),
  async (req: Request, res: Response): Promise<void> => {
    const schema = z.object({
      userId: z.string(),
      periodStart: z.string().datetime(),
      periodEnd: z.string().datetime(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.flatten() });
      return;
    }

    const record = await computeAndSaveScore(parsed.data.userId, {
      start: new Date(parsed.data.periodStart),
      end: new Date(parsed.data.periodEnd),
    });

    res.json({ success: true, data: { scoreRecord: record } });
  }
);

export default router;
