import { Router, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { uploadPhoto } from '../services/photoService';
import type { PhotoType } from '@prisma/client';

const router = Router();

// Store files in memory for S3 upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (JPEG, PNG, WebP, GIF)'));
    }
  },
});

const uploadSchema = z.object({
  ticketId: z.string().min(1),
  photoType: z.enum(['before', 'after', 'completion']),
});

// POST /api/photos/upload
router.post(
  '/upload',
  authenticate,
  upload.single('photo'),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.flatten() });
      return;
    }

    if (!req.file) {
      res.status(400).json({ success: false, error: 'No photo file provided' });
      return;
    }

    try {
      const photo = await uploadPhoto({
        ticketId: parsed.data.ticketId,
        uploaderId: req.user.sub,
        photoType: parsed.data.photoType as PhotoType,
        fileBuffer: req.file.buffer,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
      });

      res.status(201).json({ success: true, data: { photo } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      res.status(400).json({ success: false, error: message });
    }
  }
);

export default router;
