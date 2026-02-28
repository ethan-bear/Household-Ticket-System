import { prisma } from '../lib/prisma';
import { computeScore } from '@household/domain';
import type { ScoringInput, TicketHistory, TicketEventType } from '@household/domain';
import type { TicketStatus, Severity } from '@prisma/client';

export interface Period {
  start: Date;
  end: Date;
}

/**
 * Compute and persist score for a user over a given period.
 * Fetches all tickets assigned to the user in the period, maps to TicketHistory,
 * calls the pure domain computeScore, then upserts a ScoreRecord.
 */
export async function computeAndSaveScore(userId: string, period: Period) {
  // Load tickets assigned to this user in the period
  const tickets = await prisma.ticket.findMany({
    where: {
      assignedUserId: userId,
      createdAt: { gte: period.start, lte: period.end },
    },
    include: {
      auditLogs: { orderBy: { createdAt: 'asc' } },
      photos: true,
    },
  });

  // Count of completed tickets by all users in same period (for volume normalization)
  const allUserCounts = await prisma.ticket.groupBy({
    by: ['assignedUserId'],
    where: {
      status: 'closed',
      closedAt: { gte: period.start, lte: period.end },
      assignedUserId: { not: null },
    },
    _count: { id: true },
  });

  const maxCompleted = Math.max(
    ...allUserCounts.map((u) => u._count.id),
    0
  );

  const userCompleted =
    allUserCounts.find((u) => u.assignedUserId === userId)?._count.id ?? 0;

  // Map to TicketHistory
  const history: TicketHistory[] = tickets.map((ticket) => {
    const events: TicketEventType[] = [];

    // Track rejections: each needs_review → in_progress transition in audit log
    const logs = ticket.auditLogs;
    for (const log of logs) {
      if (log.fromStatus === 'needs_review' && log.toStatus === 'in_progress') {
        events.push('rejection');
      }
    }

    // Submission event
    if (ticket.status === 'closed' || ticket.status === 'needs_review') {
      events.push('completed');
    }

    if (ticket.status === 'skipped') {
      events.push('skipped');
    }

    const openedAt = ticket.createdAt;
    const submittedLog = logs.find(
      (l) => l.toStatus === 'needs_review'
    );
    const submittedAt = submittedLog?.createdAt;

    return {
      id: ticket.id,
      severity: ticket.severity as Severity,
      isRecurring: !!ticket.recurringTemplateId,
      isInspection: ticket.isInspection,
      openedAt,
      submittedAt,
      events,
      wasSkipped: ticket.status === 'skipped',
    };
  });

  const input: ScoringInput = {
    tickets: history,
    period,
    completedCount: userCompleted,
    maxCompletedByAnyUser: maxCompleted,
  };

  const breakdown = computeScore(input);

  // Upsert ScoreRecord
  const existing = await prisma.scoreRecord.findFirst({
    where: {
      userId,
      periodStart: period.start,
      periodEnd: period.end,
    },
  });

  if (existing) {
    return prisma.scoreRecord.update({
      where: { id: existing.id },
      data: {
        qualityScore: breakdown.quality,
        consistencyScore: breakdown.consistency,
        speedScore: breakdown.speed,
        volumeScore: breakdown.volume,
        totalScore: breakdown.total,
        computedAt: new Date(),
      },
    });
  }

  return prisma.scoreRecord.create({
    data: {
      userId,
      periodStart: period.start,
      periodEnd: period.end,
      qualityScore: breakdown.quality,
      consistencyScore: breakdown.consistency,
      speedScore: breakdown.speed,
      volumeScore: breakdown.volume,
      totalScore: breakdown.total,
    },
  });
}

/**
 * Get the latest score record for a user.
 */
export async function getLatestScore(userId: string) {
  return prisma.scoreRecord.findFirst({
    where: { userId },
    orderBy: { computedAt: 'desc' },
  });
}

/**
 * Get score history for a user.
 */
export async function getScoreHistory(userId: string) {
  return prisma.scoreRecord.findMany({
    where: { userId },
    orderBy: { periodStart: 'desc' },
  });
}
