import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { transitionTicket } from './ticketService';
import type { Role, TicketStatus } from '@prisma/client';

// Tool definitions for Claude
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'create_ticket',
    description: 'Create a new household ticket/task',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Short title for the task' },
        description: { type: 'string', description: 'Detailed description' },
        area: { type: 'string', description: 'Area of the home (kitchen, bathroom, pool, yard, bedroom, living, etc.)' },
        category: { type: 'string', description: 'Category of task (cleaning, repair, maintenance, inspection, etc.)' },
        severity: {
          type: 'string',
          enum: ['minor', 'needs_fix_today', 'immediate_interrupt'],
          description: 'Urgency level. immediate_interrupt is only allowed for mother/father.',
        },
        assignedUserId: { type: 'string', description: 'User ID to assign to (optional)' },
        isInspection: { type: 'boolean', description: 'Whether this requires before/after photos' },
      },
      required: ['title', 'description', 'area', 'category', 'severity'],
    },
  },
  {
    name: 'read_tickets',
    description: 'List household tickets/tasks with optional filters',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'in_progress', 'needs_review', 'closed', 'skipped'],
          description: 'Filter by status (optional)',
        },
        area: { type: 'string', description: 'Filter by area, e.g. kitchen (optional)' },
        assignedUserId: { type: 'string', description: 'Filter by assigned user ID (optional)' },
      },
    },
  },
  {
    name: 'get_ticket',
    description: 'Get details of a specific ticket by ID',
    input_schema: {
      type: 'object' as const,
      properties: {
        ticketId: { type: 'string', description: 'The ticket ID to look up' },
      },
      required: ['ticketId'],
    },
  },
  {
    name: 'update_ticket_status',
    description: 'Update the status of an existing ticket. Respects the allowed state transitions for the user\'s role.',
    input_schema: {
      type: 'object' as const,
      properties: {
        ticketId: { type: 'string', description: 'The ticket ID to update' },
        newStatus: {
          type: 'string',
          enum: ['in_progress', 'needs_review', 'closed', 'skipped'],
          description: 'The new status. Employees can only use in_progress or needs_review.',
        },
        note: { type: 'string', description: 'Optional note about the status change' },
      },
      required: ['ticketId', 'newStatus'],
    },
  },
  {
    name: 'delete_ticket',
    description: 'Permanently delete a ticket (mother only)',
    input_schema: {
      type: 'object' as const,
      properties: {
        ticketId: { type: 'string', description: 'The ticket ID to delete' },
      },
      required: ['ticketId'],
    },
  },
  {
    name: 'get_weekly_report',
    description: 'Get the weekly household task summary report with employee performance data',
    input_schema: {
      type: 'object' as const,
      properties: {
        weekOffset: {
          type: 'number',
          description: 'How many weeks back (0 = current week, 1 = last week)',
        },
      },
    },
  },
  {
    name: 'get_employee_score',
    description: "Get an employee's performance score breakdown",
    input_schema: {
      type: 'object' as const,
      properties: {
        userId: { type: 'string', description: 'The user ID to get score for' },
      },
      required: ['userId'],
    },
  },
];

// Permissions per role
const EMPLOYEE_ALLOWED_TOOLS = ['create_ticket', 'read_tickets', 'get_ticket', 'update_ticket_status', 'get_employee_score'];
const FATHER_ALLOWED_TOOLS = ['create_ticket', 'read_tickets', 'get_ticket', 'update_ticket_status', 'get_weekly_report', 'get_employee_score'];
// mother can use all tools

function getAllowedTools(role: Role): string[] {
  if (role === 'mother') return TOOLS.map((t) => t.name);
  if (role === 'father') return FATHER_ALLOWED_TOOLS;
  return EMPLOYEE_ALLOWED_TOOLS;
}

type ToolInput = Record<string, unknown>;

/**
 * Execute a tool call from Claude. Re-verifies role before executing.
 */
async function executeTool(
  toolName: string,
  toolInput: ToolInput,
  actorId: string,
  actorRole: Role
): Promise<string> {
  const allowed = getAllowedTools(actorRole);
  if (!allowed.includes(toolName)) {
    return `Error: Your role (${actorRole}) does not have permission to use the ${toolName} tool.`;
  }

  try {
    switch (toolName) {
      case 'create_ticket': {
        if (toolInput.severity === 'immediate_interrupt' && actorRole === 'employee') {
          return `Error: Only mother or father can create immediate_interrupt tickets.`;
        }
        const ticket = await prisma.ticket.create({
          data: {
            title: toolInput.title as string,
            description: toolInput.description as string,
            area: toolInput.area as string,
            category: toolInput.category as string,
            severity: toolInput.severity as any,
            isInspection: (toolInput.isInspection as boolean) ?? false,
            assignedUserId: toolInput.assignedUserId as string | undefined,
            createdById: actorId,
            status: 'open',
          },
        });
        await prisma.ticketAuditLog.create({
          data: {
            ticketId: ticket.id,
            changedById: actorId,
            fromStatus: null,
            toStatus: 'open',
            note: 'Created via chat',
          },
        });
        return `Ticket created: "${ticket.title}" (ID: ${ticket.id}, Severity: ${ticket.severity}, Area: ${ticket.area})`;
      }

      case 'read_tickets': {
        const where: Record<string, unknown> = {};
        if (toolInput.status) where.status = toolInput.status;
        if (toolInput.area) where.area = { contains: toolInput.area as string, mode: 'insensitive' };

        // Employees only see their assigned tickets
        if (actorRole === 'employee') {
          where.assignedUserId = actorId;
        } else if (toolInput.assignedUserId) {
          where.assignedUserId = toolInput.assignedUserId;
        }

        const tickets = await prisma.ticket.findMany({
          where,
          include: { assignedUser: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });

        if (tickets.length === 0) return 'No tickets found matching the filters.';

        const lines = tickets.map((t) =>
          `• [${t.id.slice(-6)}] "${t.title}" — ${t.status} | ${t.severity} | Area: ${t.area}${t.assignedUser ? ` | Assigned: ${t.assignedUser.name}` : ''}`
        );
        return `Found ${tickets.length} ticket(s):\n${lines.join('\n')}`;
      }

      case 'get_ticket': {
        const ticket = await prisma.ticket.findUnique({
          where: { id: toolInput.ticketId as string },
          include: {
            assignedUser: { select: { id: true, name: true } },
            photos: { select: { photoType: true, url: true } },
          },
        });
        if (!ticket) return `Error: Ticket ${toolInput.ticketId} not found.`;

        // Employees can only see their own assigned tickets
        if (actorRole === 'employee' && ticket.assignedUserId !== actorId) {
          return `Error: You can only view tickets assigned to you.`;
        }

        const photoList = ticket.photos.length > 0
          ? ticket.photos.map((p) => p.photoType).join(', ')
          : 'none';

        return `Ticket "${ticket.title}" (ID: ${ticket.id})\nStatus: ${ticket.status} | Severity: ${ticket.severity}\nArea: ${ticket.area} › ${ticket.category}\nAssigned: ${ticket.assignedUser?.name ?? 'Unassigned'}\nPhotos: ${photoList}\nDescription: ${ticket.description}`;
      }

      case 'update_ticket_status': {
        const newStatus = toolInput.newStatus as TicketStatus;

        // Employees can only transition to in_progress or needs_review
        if (actorRole === 'employee' && !['in_progress', 'needs_review'].includes(newStatus)) {
          return `Error: Employees can only set status to in_progress or needs_review.`;
        }

        // Use the service which applies state machine, penalty logic, and audit log
        const ticket = await transitionTicket({
          ticketId: toolInput.ticketId as string,
          toStatus: newStatus,
          actorId,
          actorRole,
          note: (toolInput.note as string) ?? 'Updated via chat',
        });

        return `Ticket "${ticket.title}" updated to ${ticket.status}.`;
      }

      case 'delete_ticket': {
        if (actorRole !== 'mother') {
          return `Error: Only mother can delete tickets.`;
        }
        const ticket = await prisma.ticket.findUnique({ where: { id: toolInput.ticketId as string } });
        if (!ticket) return `Error: Ticket ${toolInput.ticketId} not found.`;

        await prisma.ticketPhoto.deleteMany({ where: { ticketId: ticket.id } });
        await prisma.ticketAuditLog.deleteMany({ where: { ticketId: ticket.id } });
        await prisma.recurringInstance.deleteMany({ where: { ticketId: ticket.id } });
        await prisma.ticket.delete({ where: { id: ticket.id } });

        return `Ticket "${ticket.title}" has been permanently deleted.`;
      }

      case 'get_weekly_report': {
        const weekOffset = (toolInput.weekOffset as number) ?? 0;
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay() - weekOffset * 7);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);

        const [open, inProgress, closed, skipped, reopened] = await Promise.all([
          prisma.ticket.count({ where: { createdAt: { gte: weekStart, lt: weekEnd }, status: 'open' } }),
          prisma.ticket.count({ where: { createdAt: { gte: weekStart, lt: weekEnd }, status: 'in_progress' } }),
          prisma.ticket.count({ where: { createdAt: { gte: weekStart, lt: weekEnd }, status: 'closed' } }),
          prisma.ticket.count({ where: { createdAt: { gte: weekStart, lt: weekEnd }, status: 'skipped' } }),
          prisma.ticketAuditLog.count({
            where: {
              createdAt: { gte: weekStart, lt: weekEnd },
              fromStatus: 'needs_review',
              toStatus: 'in_progress',
            },
          }),
        ]);

        const repeatCount = await prisma.ticket.count({
          where: { createdAt: { gte: weekStart, lt: weekEnd }, isRepeatIssue: true },
        });

        return `Weekly Report (${weekStart.toLocaleDateString()} – ${weekEnd.toLocaleDateString()}):\n• Open: ${open} | In Progress: ${inProgress} | Closed: ${closed} | Skipped: ${skipped}\n• Rejections (reopened): ${reopened}\n• Repeat issues: ${repeatCount}`;
      }

      case 'get_employee_score': {
        // Employees can only view their own score
        if (actorRole === 'employee' && toolInput.userId !== actorId) {
          return `Error: Employees can only view their own score.`;
        }
        const score = await prisma.scoreRecord.findFirst({
          where: { userId: toolInput.userId as string },
          orderBy: { computedAt: 'desc' },
          include: { user: { select: { name: true } } },
        });

        if (!score) return `No score record found for this employee yet.`;

        return `${score.user.name}'s latest score:\n• Total: ${score.totalScore.toFixed(1)}\n• Quality: ${score.qualityScore.toFixed(1)} | Consistency: ${score.consistencyScore.toFixed(1)} | Speed: ${score.speedScore.toFixed(1)} | Volume: ${score.volumeScore.toFixed(1)}`;
      }

      default:
        return `Unknown tool: ${toolName}`;
    }
  } catch (err) {
    return `Error executing ${toolName}: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  reply: string;
  toolsUsed: string[];
}

/**
 * Process a chat message using Claude with tool use.
 * Language can be 'en' or 'es'.
 */
export async function processChat(
  message: string,
  actorId: string,
  actorRole: Role,
  language: 'en' | 'es' = 'en',
  history: ChatMessage[] = []
): Promise<ChatResponse> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const roleCapabilities: Record<Role, string> = {
    mother: 'Full access: create, read, update, delete tickets; view reports; view all scores.',
    father: 'Can create, read, update tickets; view reports; view all scores. Cannot delete tickets.',
    employee: 'Can create tickets (minor/needs_fix_today only), read own assigned tickets, update own ticket status (start or submit for review), and view own score.',
  };

  const systemPrompt =
    language === 'es'
      ? `Eres un asistente de gestión del hogar. Ayudas a gestionar tareas domésticas, inspecciones y rendimiento.
Siempre responde en español. Usa las herramientas disponibles para tomar acciones cuando se te pida.
Da respuestas cortas y claras. Nunca muestres datos crudos de la base de datos — siempre da un resumen legible.
Rol del usuario: ${actorRole}. Capacidades: ${roleCapabilities[actorRole]}`
      : `You are a household management assistant. You help manage tasks, inspections, and employee performance.
Always respond in English. Use available tools to take actions when asked.
Give short, clear human-friendly summaries. Never show raw database records.
Current user role: ${actorRole}. Capabilities: ${roleCapabilities[actorRole]}`;

  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    })),
    { role: 'user', content: message },
  ];

  const toolsUsed: string[] = [];
  let finalReply = '';

  let response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    tools: TOOLS,
    messages,
  });

  // Agentic loop: handle tool calls
  while (response.stop_reason === 'tool_use') {
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolCall of toolUseBlocks) {
      toolsUsed.push(toolCall.name);
      const result = await executeTool(
        toolCall.name,
        toolCall.input as ToolInput,
        actorId,
        actorRole
      );
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolCall.id,
        content: result,
      });
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });

    response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });
  }

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  );
  finalReply = textBlock?.text ?? 'I could not process your request.';

  return { reply: finalReply, toolsUsed };
}
