import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';

export interface JwtPayload {
  sub: string;    // userId
  role: 'mother' | 'father' | 'employee';
  jti: string;    // JWT ID for revocation
  iat: number;
  exp: number;
}

// Augment Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user: JwtPayload;
    }
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Accept from httpOnly cookie or Authorization header
    const token =
      req.cookies?.token ||
      req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    // Check token revocation
    const revoked = await prisma.revokedToken.findUnique({
      where: { jti: payload.jti },
    });

    if (revoked) {
      res.status(401).json({ success: false, error: 'Token has been revoked' });
      return;
    }

    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ success: false, error: 'Invalid token' });
      return;
    }
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ success: false, error: 'Token expired' });
      return;
    }
    next(err);
  }
}
