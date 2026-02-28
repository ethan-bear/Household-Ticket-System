import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  generateDueInstances,
} from '../services/recurringService';

const router = Router();

const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().min(1),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'custom']),
  assignedRoles: z.array(z.enum(['mother', 'father', 'employee'])).default([]),
  severityDefault: z.enum(['minor', 'needs_fix_today', 'immediate_interrupt']).default('minor'),
  area: z.string().min(1),
  category: z.string().min(1),
});

// GET /api/recurring/templates
router.get('/templates', authenticate, async (_req: Request, res: Response): Promise<void> => {
  const templates = await getTemplates();
  res.json({ success: true, data: { templates } });
});

// POST /api/recurring/templates — authority only
router.post(
  '/templates',
  authenticate,
  requireRole('mother', 'father'),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = createTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.flatten() });
      return;
    }

    const template = await createTemplate({
      ...parsed.data,
      createdById: req.user.sub,
    });

    res.status(201).json({ success: true, data: { template } });
  }
);

// PATCH /api/recurring/templates/:id — authority only
router.patch(
  '/templates/:id',
  authenticate,
  requireRole('mother', 'father'),
  async (req: Request, res: Response): Promise<void> => {
    const template = await updateTemplate(req.params.id, req.body);
    res.json({ success: true, data: { template } });
  }
);

// POST /api/recurring/instances/generate — authority only, manual trigger
router.post(
  '/instances/generate',
  authenticate,
  requireRole('mother', 'father'),
  async (_req: Request, res: Response): Promise<void> => {
    const count = await generateDueInstances();
    res.json({ success: true, data: { generated: count } });
  }
);

export default router;
