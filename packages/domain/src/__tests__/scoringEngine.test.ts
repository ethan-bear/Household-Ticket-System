import { describe, it, expect } from 'vitest';
import { computeScore } from '../scoringEngine';
import type { TicketHistory, ScoringInput } from '../scoringEngine';

const now = new Date('2024-01-15T12:00:00Z');
const period = {
  start: new Date('2024-01-08T00:00:00Z'),
  end: new Date('2024-01-15T23:59:59Z'),
};

function makeTicket(overrides: Partial<TicketHistory> = {}): TicketHistory {
  return {
    id: 'ticket-1',
    severity: 'minor',
    isRecurring: false,
    isInspection: false,
    openedAt: new Date('2024-01-10T08:00:00Z'),
    submittedAt: new Date('2024-01-10T10:00:00Z'),
    events: ['completed'],
    wasSkipped: false,
    ...overrides,
  };
}

function makeInput(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    tickets: [],
    period,
    completedCount: 0,
    maxCompletedByAnyUser: 0,
    ...overrides,
  };
}

describe('scoringEngine', () => {
  // ─── No tickets ─────────────────────────────────────────────────────────────

  describe('no tickets', () => {
    it('returns quality=100, consistency=100, speed=100, volume=0 with no tickets', () => {
      const result = computeScore(makeInput());
      expect(result.quality).toBe(100);
      expect(result.consistency).toBe(100);
      expect(result.speed).toBe(100);
      expect(result.volume).toBe(0);
    });

    it('total = 100*0.4 + 100*0.3 + 100*0.2 + 0*0.1 = 90 with no tickets', () => {
      const result = computeScore(makeInput());
      expect(result.total).toBeCloseTo(90);
    });
  });

  // ─── Quality ────────────────────────────────────────────────────────────────

  describe('quality score', () => {
    it('rejection decrements quality by 15', () => {
      const ticket = makeTicket({ events: ['rejection'] });
      const result = computeScore(makeInput({ tickets: [ticket], completedCount: 1, maxCompletedByAnyUser: 1 }));
      expect(result.quality).toBe(85); // 100 - 15*1
    });

    it('rejection with immediate_interrupt decrements quality by 60', () => {
      const ticket = makeTicket({ severity: 'immediate_interrupt', events: ['rejection'] });
      const result = computeScore(makeInput({ tickets: [ticket], completedCount: 1, maxCompletedByAnyUser: 1 }));
      expect(result.quality).toBe(40); // 100 - 15*4
    });

    it('failed_inspection decrements quality by 10', () => {
      const ticket = makeTicket({ events: ['failed_inspection'] });
      const result = computeScore(makeInput({ tickets: [ticket], completedCount: 1, maxCompletedByAnyUser: 1 }));
      expect(result.quality).toBe(90);
    });

    it('needs_fix_today failed_inspection decrements by 20', () => {
      const ticket = makeTicket({ severity: 'needs_fix_today', events: ['failed_inspection'] });
      const result = computeScore(makeInput({ tickets: [ticket], completedCount: 1, maxCompletedByAnyUser: 1 }));
      expect(result.quality).toBe(80);
    });

    it('quality can go negative with multiple violations', () => {
      const tickets = [
        makeTicket({ id: 't1', severity: 'immediate_interrupt', events: ['rejection', 'rejection', 'rejection'] }),
        makeTicket({ id: 't2', severity: 'immediate_interrupt', events: ['rejection'] }),
      ];
      const result = computeScore(makeInput({ tickets, completedCount: 2, maxCompletedByAnyUser: 2 }));
      // 100 - (15*4)*4 rejections = 100 - 240 = -140
      expect(result.quality).toBe(-140);
    });
  });

  // ─── Consistency ────────────────────────────────────────────────────────────

  describe('consistency score', () => {
    it('no recurring tickets → consistency=100', () => {
      const result = computeScore(makeInput({ tickets: [makeTicket()] }));
      expect(result.consistency).toBe(100);
    });

    it('zero skips in period → +10 streak bonus (110)', () => {
      const ticket = makeTicket({ isRecurring: true, wasSkipped: false });
      const result = computeScore(makeInput({ tickets: [ticket], completedCount: 1, maxCompletedByAnyUser: 1 }));
      expect(result.consistency).toBe(110); // 100 - 0 + 10 streak
    });

    it('1 of 2 recurring tickets skipped → 100 - 25 = 75', () => {
      const tickets = [
        makeTicket({ id: 't1', isRecurring: true, wasSkipped: false }),
        makeTicket({ id: 't2', isRecurring: true, wasSkipped: true }),
      ];
      const result = computeScore(makeInput({ tickets, completedCount: 1, maxCompletedByAnyUser: 1 }));
      // 1 skipped of 2 total: penalty = 1*(50/2) = 25. No streak bonus.
      expect(result.consistency).toBe(75);
    });

    it('all recurring tickets skipped → 50', () => {
      const tickets = [
        makeTicket({ id: 't1', isRecurring: true, wasSkipped: true }),
        makeTicket({ id: 't2', isRecurring: true, wasSkipped: true }),
      ];
      const result = computeScore(makeInput({ tickets }));
      // 2/2 skipped: penalty = 2*(50/2) = 50. No streak bonus.
      expect(result.consistency).toBe(50);
    });
  });

  // ─── Speed ──────────────────────────────────────────────────────────────────

  describe('speed score', () => {
    it('completed within deadline → 100', () => {
      const ticket = makeTicket({
        severity: 'minor',
        openedAt: new Date('2024-01-10T08:00:00Z'),
        submittedAt: new Date('2024-01-10T10:00:00Z'), // 2h, well within 48h
      });
      const result = computeScore(makeInput({ tickets: [ticket], completedCount: 1, maxCompletedByAnyUser: 1 }));
      expect(result.speed).toBe(100);
    });

    it('over deadline: loses 5 per hour', () => {
      const ticket = makeTicket({
        severity: 'minor',
        openedAt: new Date('2024-01-10T08:00:00Z'),
        submittedAt: new Date('2024-01-13T08:00:00Z'), // 72h, 24h over 48h deadline
      });
      const result = computeScore(makeInput({ tickets: [ticket], completedCount: 1, maxCompletedByAnyUser: 1 }));
      // 24 hours over deadline → -5 * 24 = -120 penalty → 100-120 = -20, floor -100
      expect(result.speed).toBe(-20);
    });

    it('speed floor is -100', () => {
      const ticket = makeTicket({
        severity: 'minor',
        openedAt: new Date('2024-01-01T08:00:00Z'),
        submittedAt: new Date('2024-02-01T08:00:00Z'), // 31 days over deadline
      });
      const result = computeScore(makeInput({ tickets: [ticket], completedCount: 1, maxCompletedByAnyUser: 1 }));
      expect(result.speed).toBe(-100);
    });

    it('immediate_interrupt 2h deadline: 1h over = -5', () => {
      const ticket = makeTicket({
        severity: 'immediate_interrupt',
        openedAt: new Date('2024-01-10T08:00:00Z'),
        submittedAt: new Date('2024-01-10T11:00:00Z'), // 3h, 1h over 2h deadline
      });
      const result = computeScore(makeInput({ tickets: [ticket], completedCount: 1, maxCompletedByAnyUser: 1 }));
      expect(result.speed).toBe(95);
    });
  });

  // ─── Volume ─────────────────────────────────────────────────────────────────

  describe('volume score', () => {
    it('user is the max → volume=100', () => {
      const result = computeScore(makeInput({ completedCount: 5, maxCompletedByAnyUser: 5 }));
      expect(result.volume).toBe(100);
    });

    it('user completed half of max → volume=50', () => {
      const result = computeScore(makeInput({ completedCount: 3, maxCompletedByAnyUser: 6 }));
      expect(result.volume).toBeCloseTo(50);
    });

    it('maxCompletedByAnyUser=0 → volume=0 (no division by zero)', () => {
      const result = computeScore(makeInput({ completedCount: 0, maxCompletedByAnyUser: 0 }));
      expect(result.volume).toBe(0);
    });
  });

  // ─── Total calculation ───────────────────────────────────────────────────────

  describe('total calculation', () => {
    it('formula: total = quality*0.4 + consistency*0.3 + speed*0.2 + volume*0.1', () => {
      const result = computeScore(
        makeInput({
          tickets: [makeTicket({ events: ['completed'], isRecurring: false })],
          completedCount: 5,
          maxCompletedByAnyUser: 5,
        })
      );
      const expected = result.quality * 0.4 + result.consistency * 0.3 + result.speed * 0.2 + result.volume * 0.1;
      expect(result.total).toBeCloseTo(expected);
    });
  });
});
