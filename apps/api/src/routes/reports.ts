import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { prisma } from '../lib/prisma';

const router = Router();

const SEVERITY_MULTIPLIER: Record<string, number> = {
  minor: 1,
  needs_fix_today: 2,
  immediate_interrupt: 4,
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

    // --- Per-employee stats + penalties ---
    const employees = await prisma.user.findMany({
      where: { role: 'employee' },
      select: { id: true, name: true, specialty: true },
    });

    const employeeStats = await Promise.all(
      employees.map(async (emp) => {
        const empFilter = { ...periodFilter, assignedUserId: emp.id };

        const [empOpen, empClosed, empSkipped, rejectedLogs] = await Promise.all([
          prisma.ticket.count({ where: { ...empFilter, status: 'open' } }),
          prisma.ticket.count({ where: { ...empFilter, status: 'closed' } }),
          prisma.ticket.count({ where: { ...empFilter, status: 'skipped' } }),
          prisma.ticketAuditLog.findMany({
            where: {
              fromStatus: 'needs_review',
              toStatus: 'in_progress',
              createdAt: { gte: weekStart, lt: weekEnd },
              ticket: { assignedUserId: emp.id },
            },
            include: { ticket: { select: { severity: true } } },
          }),
        ]);

        // Quality penalty: 15 × severity multiplier per rejection
        const qualityPenalty = rejectedLogs.reduce((sum, log) => {
          const mult = SEVERITY_MULTIPLIER[log.ticket.severity] ?? 1;
          return sum + 15 * mult;
        }, 0);

        // Consistency penalty: 50 / total recurring assigned (simplified: 10 per skip)
        const consistencyPenalty = empSkipped * 10;

        return {
          user: emp,
          open: empOpen,
          closed: empClosed,
          skipped: empSkipped,
          rejected: rejectedLogs.length,
          qualityPenalty,
          consistencyPenalty,
          totalPenalty: qualityPenalty + consistencyPenalty,
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

    // Hot spots: areas with the most tickets created this week
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
    // Add rejection counts per area from audit logs
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

    // Overdue tickets (dueAt passed, not closed/skipped)
    const overdueCount = await prisma.ticket.count({
      where: {
        dueAt: { lt: now },
        status: { notIn: ['closed', 'skipped'] },
      },
    });

    // Employees with zero completions this week
    const noCompletions = employeeStats
      .filter((s) => s.closed === 0 && (s.open > 0 || s.skipped > 0))
      .map((s) => s.user.name);

    // Most penalized employee
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
          reopened: rejectionLogs, // reopened = rejected back to in_progress
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
