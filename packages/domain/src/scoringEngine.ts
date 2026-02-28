// Scoring Engine — Simplified
// Pure function — no framework imports.
// Rules (plain English):
//   Base score: 100 pts
//   Each rejection (work sent back): −10 pts
//   Each skipped recurring task:     −5 pts
//   Each day late per task:          −3 pts
//   Perfect period bonus:            +5 pts (if at least 1 ticket and no violations)

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

  openedAt: Date;
  submittedAt?: Date;

  events: TicketEventType[];
  wasSkipped: boolean;
  rejectedInspection?: boolean;
}

export interface ScoreBreakdown {
  quality: number;     // rejection deductions (0 or negative)
  consistency: number; // skip deductions (0 or negative)
  speed: number;       // lateness deductions (0 or negative)
  volume: number;      // perfect-period bonus (0 or +5)
  total: number;       // 100 + quality + consistency + speed + volume
}

// Deadline for each severity (ms) — used for speed penalty
const DEADLINE_MS: Record<Severity, number> = {
  immediate_interrupt: 2  * 60 * 60 * 1000,  // 2 hours
  needs_fix_today:     8  * 60 * 60 * 1000,  // 8 hours
  minor:               48 * 60 * 60 * 1000,  // 48 hours
};

export interface ScoringInput {
  tickets: TicketHistory[];
  period: Period;
  /** Kept for interface compatibility — not used in simplified model */
  completedCount: number;
  /** Kept for interface compatibility — not used in simplified model */
  maxCompletedByAnyUser: number;
}

/**
 * Compute a simple, transparent score for a user in a period.
 * Pure function — no side effects.
 */
export function computeScore(input: ScoringInput): ScoreBreakdown {
  const { tickets } = input;

  // Quality: flat -10 per rejection (no severity multiplier)
  const rejections = tickets.reduce(
    (sum, t) => sum + t.events.filter((e) => e === 'rejection').length,
    0
  );
  const quality = rejections > 0 ? -(rejections * 10) : 0;

  // Consistency: -5 per skipped recurring task
  const skips = tickets.filter((t) => t.isRecurring && t.wasSkipped).length;
  const consistency = skips > 0 ? -(skips * 5) : 0;

  // Speed: -3 per calendar day over the severity deadline (summed across all tasks)
  let totalDaysLate = 0;
  for (const ticket of tickets) {
    if (!ticket.submittedAt) continue;
    const deadline = DEADLINE_MS[ticket.severity];
    const elapsed = ticket.submittedAt.getTime() - ticket.openedAt.getTime();
    if (elapsed > deadline) {
      const daysLate = Math.ceil((elapsed - deadline) / (24 * 60 * 60 * 1000));
      totalDaysLate += daysLate;
    }
  }
  const speed = totalDaysLate > 0 ? -(totalDaysLate * 3) : 0;

  // Bonus: +5 if there was work to do and zero violations this period
  const perfect =
    tickets.length > 0 &&
    rejections === 0 &&
    skips === 0 &&
    totalDaysLate === 0;
  const volume = perfect ? 5 : 0;

  const total = 100 + quality + consistency + speed + volume;

  return { quality, consistency, speed, volume, total };
}
