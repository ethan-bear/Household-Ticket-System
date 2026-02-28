// Scoring Engine
// Pure function — no framework imports.
// Input: TicketHistory[] for a user in a period.
// Output: ScoreBreakdown with quality, consistency, speed, volume, total.

export type Severity = 'minor' | 'needs_fix_today' | 'immediate_interrupt';
export type TicketStatus = 'open' | 'in_progress' | 'needs_review' | 'closed' | 'skipped';

export interface Period {
  start: Date;
  end: Date;
}

export type TicketEventType =
  | 'rejection'           // needs_review → in_progress by authority
  | 'failed_inspection'   // authority closed with rejectedInspection=true
  | 'completed'           // reached needs_review (submitted for review)
  | 'skipped';            // recurring instance skipped

export interface TicketHistory {
  id: string;
  severity: Severity;
  isRecurring: boolean;
  isInspection: boolean;

  // For speed calculation: time from open to needs_review transition
  openedAt: Date;
  submittedAt?: Date;   // when needs_review was reached; undefined if not yet submitted

  // Events for quality/consistency
  events: TicketEventType[];

  // Skipped flag (for consistency calculation)
  wasSkipped: boolean;

  // If this was a rejection, was the inspection also marked as failed?
  rejectedInspection?: boolean;
}

export interface ScoreBreakdown {
  quality: number;       // 0-100+ (can go negative)
  consistency: number;   // 0-100+ (can go negative)
  speed: number;         // 0-100 (capped at 100, floor -100)
  volume: number;        // 0-100
  total: number;         // weighted sum
}

// Severity multipliers for penalty calculations
const SEVERITY_MULTIPLIER: Record<Severity, number> = {
  minor:               1,
  needs_fix_today:     2,
  immediate_interrupt: 4,
};

// Speed deadlines in milliseconds
const SPEED_DEADLINE_MS: Record<Severity, number> = {
  immediate_interrupt: 2 * 60 * 60 * 1000,   // 2 hours
  needs_fix_today:     8 * 60 * 60 * 1000,   // 8 hours
  minor:               48 * 60 * 60 * 1000,  // 48 hours
};

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function computeQuality(tickets: TicketHistory[]): number {
  let score = 100;
  for (const ticket of tickets) {
    const mult = SEVERITY_MULTIPLIER[ticket.severity];
    for (const event of ticket.events) {
      if (event === 'rejection') {
        score -= 15 * mult;
      } else if (event === 'failed_inspection') {
        score -= 10 * mult;
      }
    }
  }
  return score;
}

function computeConsistency(tickets: TicketHistory[]): number {
  const recurringTickets = tickets.filter((t) => t.isRecurring);
  const total = recurringTickets.length;

  if (total === 0) {
    // No recurring tickets in period: full consistency
    return 100;
  }

  const skippedCount = recurringTickets.filter((t) => t.wasSkipped).length;
  const skippedPenalty = skippedCount * (50 / total);

  const hasZeroSkips = skippedCount === 0;
  const streakBonus = hasZeroSkips ? 10 : 0;

  return 100 - skippedPenalty + streakBonus;
}

function computeSpeedForTicket(ticket: TicketHistory): number {
  if (!ticket.submittedAt) {
    // Not yet submitted — treat as ongoing; don't penalize for speed yet
    return 100;
  }

  const deadline = SPEED_DEADLINE_MS[ticket.severity];
  const elapsed = ticket.submittedAt.getTime() - ticket.openedAt.getTime();

  if (elapsed <= deadline) {
    return 100;
  }

  // Minor tickets with no explicit due date and no severity-based deadline:
  // same-day = 100, otherwise = 80 (handled via the minor check below)
  if (ticket.severity === 'minor') {
    if (isSameCalendarDay(ticket.openedAt, ticket.submittedAt)) {
      return 100;
    }
    // Check if it was completed within the 48h deadline
    if (elapsed <= deadline) {
      return 100;
    }
  }

  // Over deadline: lose 5 points per hour, floor at -100
  const hoursOver = Math.ceil((elapsed - deadline) / (60 * 60 * 1000));
  const penalty = hoursOver * 5;
  return Math.max(-100, 100 - penalty);
}

function computeSpeed(tickets: TicketHistory[]): number {
  const submitted = tickets.filter((t) => t.submittedAt != null);

  if (submitted.length === 0) {
    return 100;
  }

  const scores = submitted.map(computeSpeedForTicket);
  const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  return avg;
}

/**
 * Compute volume score for this user relative to the max completed by any user.
 * maxCompletedByAnyUser should be pre-computed by the caller from all users' data.
 */
function computeVolume(completedCount: number, maxCompletedByAnyUser: number): number {
  if (maxCompletedByAnyUser === 0) return 0;
  return (completedCount / maxCompletedByAnyUser) * 100;
}

export interface ScoringInput {
  tickets: TicketHistory[];
  period: Period;
  /** Count of tickets submitted (reached needs_review) by this user in the period */
  completedCount: number;
  /** Max completed count by any single user in the same period (for volume normalization) */
  maxCompletedByAnyUser: number;
}

/**
 * Compute score breakdown for a user in a period.
 * Pure function — no side effects.
 */
export function computeScore(input: ScoringInput): ScoreBreakdown {
  const { tickets, completedCount, maxCompletedByAnyUser } = input;

  const quality = computeQuality(tickets);
  const consistency = computeConsistency(tickets);
  const speed = computeSpeed(tickets);
  const volume = computeVolume(completedCount, maxCompletedByAnyUser);

  // Weights: Quality 40%, Consistency 30%, Speed 20%, Volume 10%
  const total =
    quality * 0.4 +
    consistency * 0.3 +
    speed * 0.2 +
    volume * 0.1;

  return { quality, consistency, speed, volume, total };
}
