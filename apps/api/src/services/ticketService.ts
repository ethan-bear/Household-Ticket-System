import { prisma } from '../lib/prisma';
import { validateTransition, TicketTransitionError } from '@household/domain';
import { isRepeatIssue } from '@household/domain';
import type { Ticket, TicketStatus, Severity, Role } from '@prisma/client';

export { TicketTransitionError };

export interface CreateTicketInput {
  title: string;
  description: string;
  area: string;
  category: string;
  severity: Severity;
  isInspection: boolean;
  assignedUserId?: string;
  recurringTemplateId?: string;
  dueAt?: Date;
  createdById: string;
  creatorRole: string;
}

export interface TransitionTicketInput {
  ticketId: string;
  toStatus: TicketStatus;
  actorId: string;
  actorRole: string;
  note?: string;
}

/**
 * Creates a new ticket. Checks repeat issue detection and severity role restrictions.
 */
export async function createTicket(input: CreateTicketInput): Promise<Ticket> {
  const {
    title,
    description,
    area,
    category,
    severity,
    isInspection,
    assignedUserId,
    recurringTemplateId,
    dueAt,
    createdById,
    creatorRole,
  } = input;

  // immediate_interrupt tickets can only be created by mother or father
  if (severity === 'immediate_interrupt' && creatorRole === 'employee') {
    throw new Error('Only mother or father may create immediate_interrupt tickets');
  }

  // Repeat issue detection: check for same area+category closed within 7 days
  const recentClosed = await prisma.ticket.findMany({
    where: {
      area,
      category,
      status: 'closed',
      closedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    select: { id: true, area: true, category: true, closedAt: true },
  });

  const repeatResult = isRepeatIssue(
    { area, category, createdAt: new Date() },
    recentClosed.map((t) => ({
      id: t.id,
      area: t.area,
      category: t.category,
      closedAt: t.closedAt!,
    }))
  );

  const ticket = await prisma.ticket.create({
    data: {
      title,
      description,
      area,
      category,
      severity,
      isInspection,
      isRepeatIssue: repeatResult.isRepeat,
      previousTicketId: repeatResult.previousTicketId,
      status: 'open',
      assignedUserId,
      createdById,
      recurringTemplateId,
      dueAt,
    },
  });

  // Initial audit log entry
  await prisma.ticketAuditLog.create({
    data: {
      ticketId: ticket.id,
      changedById: createdById,
      fromStatus: null,
      toStatus: 'open',
      note: 'Ticket created',
    },
  });

  return ticket;
}

/**
 * Transitions a ticket to a new status.
 * Validates the transition using the domain state machine.
 * Applies quality penalty on rejection (needs_review → in_progress).
 * Requires photos before needs_review transition.
 */
export async function transitionTicket(input: TransitionTicketInput): Promise<Ticket> {
  const { ticketId, toStatus, actorId, actorRole, note } = input;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { photos: true },
  });

  if (!ticket) {
    throw new Error(`Ticket ${ticketId} not found`);
  }

  // Validate via domain state machine
  const result = validateTransition(
    ticket.status as import('@household/domain').TicketStatus,
    toStatus as import('@household/domain').TicketStatus,
    actorRole as import('@household/domain').Role,
    {
      id: ticket.id,
      status: ticket.status as import('@household/domain').TicketStatus,
      isRecurring: !!ticket.recurringTemplateId,
      severity: ticket.severity as import('@household/domain').Severity,
    }
  );

  // Photo requirement: needs_review requires at least one photo
  if (toStatus === 'needs_review') {
    const hasPhoto = ticket.photos.length > 0;
    if (!hasPhoto) {
      throw new Error(
        'Cannot transition to needs_review: at least one photo is required before submitting for review'
      );
    }

    // Inspection tickets require both before AND after photos
    if (ticket.isInspection) {
      const hasBefore = ticket.photos.some((p) => p.photoType === 'before');
      const hasAfter = ticket.photos.some((p) => p.photoType === 'after');
      if (!hasBefore || !hasAfter) {
        throw new Error(
          'Inspection tickets require both a before photo and an after photo before submission'
        );
      }
    }
  }

  // Apply rejection penalty if this is a rejection
  if (result.isRejection && ticket.assignedUserId) {
    // Note: quality score is recomputed by scoringService on demand — just log it
    await prisma.ticketAuditLog.create({
      data: {
        ticketId: ticket.id,
        changedById: actorId,
        fromStatus: ticket.status,
        toStatus,
        note: note ?? 'rejected',
      },
    });
  } else {
    await prisma.ticketAuditLog.create({
      data: {
        ticketId: ticket.id,
        changedById: actorId,
        fromStatus: ticket.status,
        toStatus,
        note,
      },
    });
  }

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      status: toStatus,
      closedAt: toStatus === 'closed' ? new Date() : undefined,
    },
  });

  return updated;
}

export async function getTickets(filters: {
  status?: TicketStatus;
  assignedUserId?: string;
  area?: string;
  requestorId: string;
  requestorRole: string;
}) {
  const { status, assignedUserId, area, requestorId, requestorRole } = filters;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (area) where.area = area;

  // Employees can only see their own tickets
  if (requestorRole === 'employee') {
    where.assignedUserId = requestorId;
  } else if (assignedUserId) {
    where.assignedUserId = assignedUserId;
  }

  return prisma.ticket.findMany({
    where,
    include: {
      assignedUser: { select: { id: true, name: true, role: true, specialty: true } },
      createdBy: { select: { id: true, name: true, role: true } },
      photos: true,
      recurringTemplate: { select: { frequency: true } },
    },
    orderBy: [
      { severity: 'desc' },
      { createdAt: 'desc' },
    ],
  });
}

export async function getTicketById(ticketId: string, requestorId: string, requestorRole: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      assignedUser: { select: { id: true, name: true, role: true, specialty: true } },
      createdBy: { select: { id: true, name: true, role: true } },
      photos: true,
      auditLogs: {
        include: { changedBy: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!ticket) return null;

  // Employees can only see their own tickets
  if (requestorRole === 'employee' && ticket.assignedUserId !== requestorId) {
    return null;
  }

  return ticket;
}
