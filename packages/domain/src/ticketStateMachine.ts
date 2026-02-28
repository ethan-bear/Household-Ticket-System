// Ticket State Machine
// Pure function — no framework imports.
// Throws TicketTransitionError with descriptive messages on any invalid transition.

export type Role = 'mother' | 'father' | 'employee';

export type TicketStatus =
  | 'open'
  | 'in_progress'
  | 'needs_review'
  | 'closed'
  | 'skipped';

export type Severity =
  | 'minor'
  | 'needs_fix_today'
  | 'immediate_interrupt';

export interface TicketContext {
  id: string;
  status: TicketStatus;
  isRecurring: boolean;
  severity: Severity;
  assignedUserId?: string;
}

export class TicketTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TicketTransitionError';
  }
}

// Valid base transitions (role checks applied separately below)
const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open:         ['in_progress', 'skipped'],
  in_progress:  ['needs_review', 'skipped'],
  needs_review: ['closed', 'in_progress'],
  closed:       [],
  skipped:      [],
};

// Transitions that require authority role (mother or father)
const AUTHORITY_ONLY_TRANSITIONS: Array<{ from: TicketStatus; to: TicketStatus }> = [
  { from: 'needs_review', to: 'closed' },
  { from: 'needs_review', to: 'in_progress' }, // rejection/reopen
  { from: 'open', to: 'skipped' },
  { from: 'in_progress', to: 'skipped' },
];

function isAuthority(role: Role): boolean {
  return role === 'mother' || role === 'father';
}

export interface TransitionResult {
  isRejection: boolean; // true when needs_review → in_progress (penalty applies)
}

/**
 * Validates a ticket status transition.
 * Throws TicketTransitionError with a descriptive message if invalid.
 * Returns TransitionResult on success.
 */
export function validateTransition(
  from: TicketStatus,
  to: TicketStatus,
  actorRole: Role,
  ticket: TicketContext
): TransitionResult {
  // Terminal state check
  if (from === 'closed') {
    throw new TicketTransitionError(
      `Ticket ${ticket.id} is closed. Closed tickets have no outgoing transitions. Create a new ticket for recurring issues.`
    );
  }

  if (from === 'skipped') {
    throw new TicketTransitionError(
      `Ticket ${ticket.id} is skipped. Skipped tickets cannot be transitioned.`
    );
  }

  // Base transition validity
  const validTargets = VALID_TRANSITIONS[from];
  if (!validTargets.includes(to)) {
    throw new TicketTransitionError(
      `Invalid transition: ${from} → ${to}. Valid transitions from '${from}': [${validTargets.join(', ')}].`
    );
  }

  // Skip transitions only allowed for recurring tickets
  if (to === 'skipped' && !ticket.isRecurring) {
    throw new TicketTransitionError(
      `Ticket ${ticket.id} cannot be skipped: only recurring ticket instances may be skipped.`
    );
  }

  // Authority-only transition check
  const requiresAuthority = AUTHORITY_ONLY_TRANSITIONS.some(
    (t) => t.from === from && t.to === to
  );

  if (requiresAuthority && !isAuthority(actorRole)) {
    throw new TicketTransitionError(
      `Transition ${from} → ${to} requires authority role (mother or father). Actor role: ${actorRole}.`
    );
  }

  // Rejection path: needs_review → in_progress triggers penalty
  const isRejection = from === 'needs_review' && to === 'in_progress';

  return { isRejection };
}
