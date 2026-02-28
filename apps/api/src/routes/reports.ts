import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { prisma } from '../lib/prisma';

const router = Router();

// GET /api/reports/weekly?weekOffset=0
router.get(
  '/weekly',
  authenticate,
  requireRole('mother', 'father'),
  async (req: Request, res: Response): Promise<void> => {
    const weekOffset = parseInt((req.query.weekOffset as string) ?? '0', 10);

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() - weekOffset * 7); // Sunday
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const periodFilter = {
      createdAt: { gte: weekStart, lt: weekEnd },
    };

    const [openCount, closedCount, skippedCount] = await Promise.all([
      prisma.ticket.count({ where: { ...periodFilter, status: 'open' } }),
      prisma.ticket.count({ where: { ...periodFilter, status: 'closed' } }),
      prisma.ticket.count({ where: { ...periodFilter, status: 'skipped' } }),
    ]);

    // Count rejections (needs_review → in_progress transitions)
    const rejectionLogs = await prisma.ticketAuditLog.count({
      where: {
        fromStatus: 'needs_review',
        toStatus: 'in_progress',
        createdAt: { gte: weekStart, lt: weekEnd },
      },
    });

    // Per-employee ticket counts
    const employees = await prisma.user.findMany({
      where: { role: 'employee' },
      select: { id: true, name: true, specialty: true },
    });

    const employeeStats = await Promise.all(
      employees.map(async (emp) => {
        const empFilter = { ...periodFilter, assignedUserId: emp.id };
        const [empOpen, empClosed, empSkipped, empRejected] = await Promise.all([
          prisma.ticket.count({ where: { ...empFilter, status: 'open' } }),
          prisma.ticket.count({ where: { ...empFilter, status: 'closed' } }),
          prisma.ticket.count({ where: { ...empFilter, status: 'skipped' } }),
          prisma.ticketAuditLog.count({
            where: {
              fromStatus: 'needs_review',
              toStatus: 'in_progress',
              createdAt: { gte: weekStart, lt: weekEnd },
              ticket: { assignedUserId: emp.id },
            },
          }),
        ]);

        return {
          user: emp,
          open: empOpen,
          closed: empClosed,
          skipped: empSkipped,
          rejected: empRejected,
        };
      })
    );

    // Repeat issues flagged this week
    const repeatIssues = await prisma.ticket.findMany({
      where: {
        ...periodFilter,
        isRepeatIssue: true,
      },
      select: {
        id: true,
        title: true,
        area: true,
        category: true,
        previousTicketId: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      data: {
        period: { start: weekStart, end: weekEnd },
        summary: {
          open: openCount,
          closed: closedCount,
          skipped: skippedCount,
          rejections: rejectionLogs,
        },
        employeeStats,
        repeatIssues,
      },
    });
  }
);

export default router;
