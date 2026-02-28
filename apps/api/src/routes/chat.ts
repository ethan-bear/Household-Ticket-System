import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { processChat } from '../services/chatService';
import type { Role } from '@prisma/client';

const router = Router();

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  language: z.enum(['en', 'es']).default('en'),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .optional()
    .default([]),
});

// POST /api/chat/message
router.post('/message', authenticate, async (req: Request, res: Response): Promise<void> => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  try {
    const result = await processChat(
      parsed.data.message,
      req.user.sub,
      req.user.role as Role,
      parsed.data.language,
      parsed.data.history
    );

    res.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Chat processing failed';
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
