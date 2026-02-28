import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  createTicket,
  transitionTicket,
  getTickets,
  getTicketById,
  TicketTransitionError,
} from '../services/ticketService';
import { prisma } from '../lib/prisma';
import type { TicketStatus, Severity } from '@prisma/client';

const router = Router();

const createTicketSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1),
  area: z.string().min(1),
  category: z.string().min(1),
  severity: z.enum(['minor', 'needs_fix_today', 'immediate_interrupt']),
  isInspection: z.boolean().default(false),
  assignedUserId: z.string().optional(),
  dueAt: z.string().datetime().optional(),
});

const transitionSchema = z.object({
  status: z.enum(['open', 'in_progress', 'needs_review', 'closed', 'skipped']),
  note: z.string().optional(),
});

// GET /api/tickets
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { status, assignedUserId, area } = req.query;

  const tickets = await getTickets({
    status: status as TicketStatus | undefined,
    assignedUserId: assignedUserId as string | undefined,
    area: area as string | undefined,
    requestorId: req.user.sub,
    requestorRole: req.user.role,
  });

  res.json({ success: true, data: { tickets } });
});

// GET /api/tickets/:id
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  const ticket = await getTicketById(req.params.id, req.user.sub, req.user.role);

  if (!ticket) {
    res.status(404).json({ success: false, error: 'Ticket not found' });
    return;
  }

  res.json({ success: true, data: { ticket } });
});

// GET /api/tickets/:id/audit — authority only
router.get(
  '/:id/audit',
  authenticate,
  requireRole('mother', 'father'),
  async (req: Request, res: Response): Promise<void> => {
    const logs = await prisma.ticketAuditLog.findMany({
      where: { ticketId: req.params.id },
      include: { changedBy: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ success: true, data: { auditLogs: logs } });
  }
);

// POST /api/tickets
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const parsed = createTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  try {
    const ticket = await createTicket({
      ...parsed.data,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : undefined,
      createdById: req.user.sub,
      creatorRole: req.user.role,
    });

    res.status(201).json({ success: true, data: { ticket } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create ticket';
    res.status(400).json({ success: false, error: message });
  }
});

// PATCH /api/tickets/:id/status
router.patch('/:id/status', authenticate, async (req: Request, res: Response): Promise<void> => {
  const parsed = transitionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  try {
    const ticket = await transitionTicket({
      ticketId: req.params.id,
      toStatus: parsed.data.status,
      actorId: req.user.sub,
      actorRole: req.user.role,
      note: parsed.data.note,
    });

    res.json({ success: true, data: { ticket } });
  } catch (err) {
    if (err instanceof TicketTransitionError) {
      res.status(422).json({ success: false, error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Transition failed';
    res.status(400).json({ success: false, error: message });
  }
});

export default router;
