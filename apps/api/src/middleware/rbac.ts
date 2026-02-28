import { Request, Response, NextFunction } from 'express';

type Role = 'mother' | 'father' | 'employee';

/**
 * Factory: creates middleware that restricts access to specified roles.
 * Must be used AFTER authenticate middleware.
 *
 * Usage: router.delete('/tickets/:id', authenticate, requireRole('mother'), handler)
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role as Role)) {
      res.status(403).json({
        success: false,
        error: `Forbidden: requires role ${roles.join(' or ')}. Your role: ${req.user.role}`,
      });
      return;
    }

    next();
  };
}
