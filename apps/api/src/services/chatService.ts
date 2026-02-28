import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import type { Role } from '@prisma/client';

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
        area: { type: 'string', description: 'Area of the home (kitchen, bathroom, pool, yard, etc.)' },
        category: { type: 'string', description: 'Category of task (cleaning, repair, maintenance, etc.)' },
        severity: {
          type: 'string',
          enum: ['minor', 'needs_fix_today', 'immediate_interrupt'],
          description: 'Urgency level',
        },
        assignedUserId: { type: 'string', description: 'User ID to assign to (optional)' },
        isInspection: { type: 'boolean', description: 'Whether this is an inspection task requiring before/after photos' },
      },
      required: ['title', 'description', 'area', 'category', 'severity'],
    },
  },
  {
    name: 'update_ticket_status',
    description: 'Update the status of an existing ticket',
    input_schema: {
      type: 'object' as const,
      properties: {
        ticketId: { type: 'string', description: 'The ticket ID to update' },
        newStatus: {
          type: 'string',
          enum: ['in_progress', 'needs_review', 'closed', 'skipped'],
          description: 'The new status',
        },
        note: { type: 'string', description: 'Optional note about the status change' },
      },
      required: ['ticketId', 'newStatus'],
    },
  },
  {
    name: 'get_weekly_report',
    description: 'Get the weekly household task summary report',
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
    description: "Get an employee's performance score",
    input_schema: {
      type: 'object' as const,
      properties: {
        userId: { type: 'string', description: 'The user ID to get score for' },
      },
      required: ['userId'],
    },
  },
];

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
  // Role-scoped tool access
  if (actorRole === 'employee') {
    if (!['create_ticket', 'get_employee_score'].includes(toolName)) {
      return `Error: Employees can only use create_ticket and get_employee_score tools.`;
    }
    // Employees can only get their own score
    if (toolName === 'get_employee_score' && toolInput.userId !== actorId) {
      return `Error: Employees can only view their own score.`;
    }
  }

  try {
    switch (toolName) {
      case 'create_ticket': {
        // immediate_interrupt restricted to authority
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
        // Audit log
        await prisma.ticketAuditLog.create({
          data: {
            ticketId: ticket.id,
            changedById: actorId,
            fromStatus: null,
            toStatus: 'open',
            note: 'Created via chat',
          },
        });
        return `Ticket created: "${ticket.title}" (ID: ${ticket.id}, Severity: ${ticket.severity})`;
      }

      case 'update_ticket_status': {
        const ticket = await prisma.ticket.findUnique({
          where: { id: toolInput.ticketId as string },
        });
        if (!ticket) return `Error: Ticket ${toolInput.ticketId} not found.`;

        // Only authority can close
        if (toolInput.newStatus === 'closed' && actorRole === 'employee') {
          return `Error: Only mother or father can close tickets.`;
        }

        await prisma.ticket.update({
          where: { id: toolInput.ticketId as string },
          data: {
            status: toolInput.newStatus as any,
            closedAt: toolInput.newStatus === 'closed' ? new Date() : undefined,
          },
        });

        await prisma.ticketAuditLog.create({
          data: {
            ticketId: toolInput.ticketId as string,
            changedById: actorId,
            fromStatus: ticket.status,
            toStatus: toolInput.newStatus as any,
            note: (toolInput.note as string) ?? 'Updated via chat',
          },
        });

        return `Ticket "${ticket.title}" updated to ${toolInput.newStatus}.`;
      }

      case 'get_weekly_report': {
        const weekOffset = (toolInput.weekOffset as number) ?? 0;
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay() - weekOffset * 7);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);

        const [open, closed, skipped] = await Promise.all([
          prisma.ticket.count({ where: { createdAt: { gte: weekStart, lt: weekEnd }, status: 'open' } }),
          prisma.ticket.count({ where: { createdAt: { gte: weekStart, lt: weekEnd }, status: 'closed' } }),
          prisma.ticket.count({ where: { createdAt: { gte: weekStart, lt: weekEnd }, status: 'skipped' } }),
        ]);

        return `Weekly Report (${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}): Open: ${open}, Closed: ${closed}, Skipped: ${skipped}`;
      }

      case 'get_employee_score': {
        const score = await prisma.scoreRecord.findFirst({
          where: { userId: toolInput.userId as string },
          orderBy: { computedAt: 'desc' },
          include: { user: { select: { name: true } } },
        });

        if (!score) return `No score record found for this employee.`;

        return `${score.user.name}'s latest score: Total: ${score.totalScore.toFixed(1)} | Quality: ${score.qualityScore.toFixed(1)} | Consistency: ${score.consistencyScore.toFixed(1)} | Speed: ${score.speedScore.toFixed(1)} | Volume: ${score.volumeScore.toFixed(1)}`;
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

  const systemPrompt =
    language === 'es'
      ? `Eres un asistente de gestión del hogar. Ayudas a gestionar tareas, inspecciones y empleados del hogar.
         Siempre responde en español. Usa las herramientas disponibles para tomar acciones cuando se te pida.
         Da respuestas cortas y claras. Nunca muestres datos sin procesar de la base de datos.
         Rol del usuario actual: ${actorRole}.`
      : `You are a household management assistant. You help manage household tasks, inspections, and employees.
         Always respond in English. Use available tools to take actions when asked.
         Give short, clear human-friendly summaries. Never show raw database records.
         Current user role: ${actorRole}.`;

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

    // Continue conversation with tool results
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

  // Extract text response
  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  );
  finalReply = textBlock?.text ?? 'I could not process your request.';

  return { reply: finalReply, toolsUsed };
}
