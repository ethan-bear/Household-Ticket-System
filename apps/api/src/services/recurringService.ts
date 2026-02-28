import { prisma } from '../lib/prisma';
import type { RecurringTemplate, Frequency } from '@prisma/client';

/**
 * Generate ticket instances for all active recurring templates
 * based on their frequency. Called by the daily cron job.
 */
export async function generateDueInstances(): Promise<number> {
  const templates = await prisma.recurringTemplate.findMany({
    where: { isActive: true },
  });

  let generated = 0;

  for (const template of templates) {
    const isDue = await isTemplateDueToday(template);
    if (!isDue) continue;

    // Create a ticket instance for this template
    const ticket = await prisma.ticket.create({
      data: {
        title: template.name,
        description: template.description,
        area: template.area,
        category: template.category,
        severity: template.severityDefault,
        isInspection: false,
        status: 'open',
        createdById: template.createdById,
        recurringTemplateId: template.id,
      },
    });

    // Initial audit log
    await prisma.ticketAuditLog.create({
      data: {
        ticketId: ticket.id,
        changedById: template.createdById,
        fromStatus: null,
        toStatus: 'open',
        note: `Auto-generated from recurring template: ${template.name}`,
      },
    });

    // Record the instance
    await prisma.recurringInstance.create({
      data: {
        templateId: template.id,
        ticketId: ticket.id,
        scheduledFor: new Date(),
      },
    });

    generated++;
  }

  return generated;
}

async function isTemplateDueToday(template: RecurringTemplate): Promise<boolean> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Check if an instance was already generated today
  const existingToday = await prisma.recurringInstance.findFirst({
    where: {
      templateId: template.id,
      generatedAt: { gte: todayStart },
    },
  });

  if (existingToday) return false;

  const freq = template.frequency as Frequency;

  switch (freq) {
    case 'daily':
      return true;

    case 'weekly': {
      // Generate on Mondays (day 1)
      return now.getDay() === 1;
    }

    case 'monthly': {
      // Generate on the 1st of the month
      return now.getDate() === 1;
    }

    case 'custom':
      // For custom frequency, always generate (caller controls scheduling)
      return true;

    default:
      return false;
  }
}

export async function getTemplates() {
  return prisma.recurringTemplate.findMany({
    include: {
      createdBy: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createTemplate(data: {
  name: string;
  description: string;
  frequency: Frequency;
  assignedRoles: string[];
  severityDefault: string;
  area: string;
  category: string;
  createdById: string;
}) {
  return prisma.recurringTemplate.create({
    data: {
      name: data.name,
      description: data.description,
      frequency: data.frequency,
      assignedRoles: data.assignedRoles as any,
      severityDefault: data.severityDefault as any,
      area: data.area,
      category: data.category,
      createdById: data.createdById,
    },
  });
}

export async function updateTemplate(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    frequency: Frequency;
    assignedRoles: string[];
    severityDefault: string;
    area: string;
    category: string;
    isActive: boolean;
  }>
) {
  return prisma.recurringTemplate.update({
    where: { id },
    data: data as any,
  });
}
