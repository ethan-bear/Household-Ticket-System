import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { prisma } from '../lib/prisma';

const router = Router();

// Severity-based deadline in ms — matches the scoring engine
const DEADLINE_MS: Record<string, number> = {
  immediate_interrupt: 2  * 60 * 60 * 1000,
  needs_fix_today:     8  * 60 * 60 * 1000,
  minor:               48 * 60 * 60 * 1000,
};

// GET /api/reports/weekly?weekOffset=0
router.get(
  '/weekly',
  authenticate,
  requireRole('mother', 'father'),
  async (req: Request, res: Response): Promise<void> => {
    const weekOffset = parseInt((req.query.weekOffset as string) ?? '0', 10);

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() - weekOffset * 7);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const periodFilter = { createdAt: { gte: weekStart, lt: weekEnd } };

    // --- Summary counts ---
    const [openCount, inProgressCount, closedCount, skippedCount, rejectionLogs] = await Promise.all([
      prisma.ticket.count({ where: { ...periodFilter, status: 'open' } }),
      prisma.ticket.count({ where: { ...periodFilter, status: 'in_progress' } }),
      prisma.ticket.count({ where: { ...periodFilter, status: 'closed' } }),
      prisma.ticket.count({ where: { ...periodFilter, status: 'skipped' } }),
      prisma.ticketAuditLog.count({
        where: { fromStatus: 'needs_review', toStatus: 'in_progress', createdAt: { gte: weekStart, lt: weekEnd } },
      }),
    ]);

    // --- Per-employee stats using simplified scoring rules ---
    const employees = await prisma.user.findMany({
      where: { role: 'employee' },
      select: { id: true, name: true, specialty: true },
    });

    const employeeStats = await Promise.all(
      employees.map(async (emp) => {
        const empFilter = { ...periodFilter, assignedUserId: emp.id };

        const [empOpen, empClosed, empSkipped, rejectedLogs, closedTickets] = await Promise.all([
          prisma.ticket.count({ where: { ...empFilter, status: 'open' } }),
          prisma.ticket.count({ where: { ...empFilter, status: 'closed' } }),
          prisma.ticket.count({ where: { ...empFilter, status: 'skipped' } }),
          // Rejections: needs_review → in_progress transitions
          prisma.ticketAuditLog.findMany({
            where: {
              fromStatus: 'needs_review',
              toStatus: 'in_progress',
              createdAt: { gte: weekStart, lt: weekEnd },
              ticket: { assignedUserId: emp.id },
            },
          }),
          // Closed tickets in this period for late-day calculation
          prisma.ticket.findMany({
            where: {
              assignedUserId: emp.id,
              status: 'closed',
              closedAt: { gte: weekStart, lt: weekEnd },
            },
            select: { severity: true, createdAt: true, closedAt: true, dueAt: true },
          }),
        ]);

        // Late-day penalty: −3 per calendar day past the effective deadline
        // Uses explicit dueAt if set, otherwise the severity-based deadline
        let daysLate = 0;
        for (const ticket of closedTickets) {
          if (!ticket.closedAt) continue;
          const effectiveDeadline = ticket.dueAt
            ? ticket.dueAt.getTime()
            : ticket.createdAt.getTime() + (DEADLINE_MS[ticket.severity] ?? DEADLINE_MS.minor);
          const elapsed = ticket.closedAt.getTime();
          if (elapsed > effectiveDeadline) {
            daysLate += Math.ceil((elapsed - effectiveDeadline) / (24 * 60 * 60 * 1000));
          }
        }

        // New simple penalties (matching scoringEngine.ts)
        const qualityPenalty     = rejectedLogs.length * 10;  // −10 per rejection
        const consistencyPenalty = empSkipped * 5;            // −5 per skip
        const latePenalty        = daysLate * 3;              // −3 per late day
        const totalPenalty       = qualityPenalty + consistencyPenalty + latePenalty;

        // Perfect-period bonus: +5 if work was done and zero violations
        const hasWork   = empClosed > 0 || empOpen > 0 || empSkipped > 0;
        const isPerfect = hasWork && totalPenalty === 0;
        const bonus     = isPerfect ? 5 : 0;

        return {
          user: emp,
          open: empOpen,
          closed: empClosed,
          skipped: empSkipped,
          rejected: rejectedLogs.length,
          daysLate,
          qualityPenalty,
          consistencyPenalty,
          latePenalty,
          totalPenalty,
          bonus,
          // Net score impact this period (positive = gained pts, negative = lost pts)
          scoreImpact: bonus - totalPenalty,
        };
      })
    );

    // --- Repeat issues ---
    const repeatIssues = await prisma.ticket.findMany({
      where: { ...periodFilter, isRepeatIssue: true },
      select: {
        id: true, title: true, area: true, category: true,
        previousTicketId: true, createdAt: true, severity: true,
        assignedUser: { select: { name: true } },
      },
    });

    // --- Trends & patterns ---
    const ticketsThisWeek = await prisma.ticket.findMany({
      where: periodFilter,
      select: { area: true, category: true, status: true, severity: true, dueAt: true },
    });

    const areaMap: Record<string, { total: number; skipped: number; rejected: number }> = {};
    for (const t of ticketsThisWeek) {
      const key = `${t.area} › ${t.category}`;
      if (!areaMap[key]) areaMap[key] = { total: 0, skipped: 0, rejected: 0 };
      areaMap[key].total++;
      if (t.status === 'skipped') areaMap[key].skipped++;
    }
    const areaRejections = await prisma.ticketAuditLog.findMany({
      where: { fromStatus: 'needs_review', toStatus: 'in_progress', createdAt: { gte: weekStart, lt: weekEnd } },
      include: { ticket: { select: { area: true, category: true } } },
    });
    for (const log of areaRejections) {
      const key = `${log.ticket.area} › ${log.ticket.category}`;
      if (areaMap[key]) areaMap[key].rejected++;
    }
    const hotSpots = Object.entries(areaMap)
      .map(([area, stats]) => ({ area, ...stats, issueScore: stats.skipped + stats.rejected }))
      .filter((a) => a.issueScore > 0)
      .sort((a, b) => b.issueScore - a.issueScore)
      .slice(0, 3);

    const overdueCount = await prisma.ticket.count({
      where: { dueAt: { lt: now }, status: { notIn: ['closed', 'skipped'] } },
    });

    const noCompletions = employeeStats
      .filter((s) => s.closed === 0 && (s.open > 0 || s.skipped > 0))
      .map((s) => s.user.name);

    const mostPenalized = [...employeeStats].sort((a, b) => b.totalPenalty - a.totalPenalty)[0];

    res.json({
      success: true,
      data: {
        period: { start: weekStart, end: weekEnd },
        summary: {
          open: openCount,
          inProgress: inProgressCount,
          closed: closedCount,
          skipped: skippedCount,
          reopened: rejectionLogs,
        },
        employeeStats,
        repeatIssues,
        trends: {
          hotSpots,
          overdueCount,
          noCompletions,
          mostPenalized: mostPenalized?.totalPenalty > 0 ? mostPenalized : null,
        },
      },
    });
  }
);

export default router;
