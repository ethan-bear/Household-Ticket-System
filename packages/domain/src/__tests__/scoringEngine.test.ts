import { describe, it, expect } from 'vitest';
import { computeScore } from '../scoringEngine';
import type { TicketHistory, ScoringInput } from '../scoringEngine';

const period = {
  start: new Date('2024-01-08T00:00:00Z'),
  end:   new Date('2024-01-15T23:59:59Z'),
};

function makeTicket(overrides: Partial<TicketHistory> = {}): TicketHistory {
  return {
    id: 'ticket-1',
    severity: 'minor',
    isRecurring: false,
    isInspection: false,
    openedAt:    new Date('2024-01-10T08:00:00Z'),
    submittedAt: new Date('2024-01-10T10:00:00Z'), // 2h, well within 48h
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

describe('scoringEngine (simplified)', () => {

  // ─── No tickets ─────────────────────────────────────────────────────────────

  describe('no tickets', () => {
    it('returns zero deductions and no bonus with no tickets', () => {
      const result = computeScore(makeInput());
      expect(result.quality).toBe(0);
      expect(result.consistency).toBe(0);
      expect(result.speed).toBe(0);
      expect(result.volume).toBe(0);
    });

    it('total = 100 with no tickets (base score, no penalty, no bonus)', () => {
      const result = computeScore(makeInput());
      expect(result.total).toBe(100);
    });
  });

  // ─── Quality (rejections) ────────────────────────────────────────────────────

  describe('quality — rejection penalties', () => {
    it('one rejection → quality = -10, total = 90', () => {
      const ticket = makeTicket({ events: ['rejection'] });
      const result = computeScore(makeInput({ tickets: [ticket] }));
      expect(result.quality).toBe(-10);
      expect(result.total).toBe(90);
    });

    it('two rejections → quality = -20, total = 80', () => {
      const tickets = [
        makeTicket({ id: 't1', events: ['rejection'] }),
        makeTicket({ id: 't2', events: ['rejection'] }),
      ];
      const result = computeScore(makeInput({ tickets }));
      expect(result.quality).toBe(-20);
      expect(result.total).toBe(80);
    });

    it('rejection applies same penalty regardless of severity', () => {
      const minor     = makeTicket({ id: 't1', severity: 'minor',               events: ['rejection'] });
      const urgent    = makeTicket({ id: 't2', severity: 'needs_fix_today',     events: ['rejection'] });
      const interrupt = makeTicket({ id: 't3', severity: 'immediate_interrupt', events: ['rejection'] });
      const result = computeScore(makeInput({ tickets: [minor, urgent, interrupt] }));
      // Three rejections: 3 × -10 = -30
      expect(result.quality).toBe(-30);
    });

    it('failed_inspection does NOT affect score in simplified model', () => {
      const ticket = makeTicket({ events: ['failed_inspection'] });
      const result = computeScore(makeInput({ tickets: [ticket] }));
      expect(result.quality).toBe(0); // no rejection, no penalty
    });

    it('quality can go deep negative with many rejections', () => {
      const tickets = Array.from({ length: 5 }, (_, i) =>
        makeTicket({ id: `t${i}`, events: ['rejection', 'rejection'] })
      );
      const result = computeScore(makeInput({ tickets }));
      // 10 rejections: -100
      expect(result.quality).toBe(-100);
      expect(result.total).toBe(0);
    });
  });

  // ─── Consistency (skips) ─────────────────────────────────────────────────────

  describe('consistency — skip penalties', () => {
    it('no skipped recurring tasks → consistency = 0', () => {
      const ticket = makeTicket({ isRecurring: true, wasSkipped: false });
      const result = computeScore(makeInput({ tickets: [ticket] }));
      expect(result.consistency).toBe(0);
    });

    it('one skipped recurring task → consistency = -5', () => {
      const ticket = makeTicket({ isRecurring: true, wasSkipped: true });
      const result = computeScore(makeInput({ tickets: [ticket] }));
      expect(result.consistency).toBe(-5);
      expect(result.total).toBe(95);
    });

    it('two skipped recurring tasks → consistency = -10', () => {
      const tickets = [
        makeTicket({ id: 't1', isRecurring: true, wasSkipped: true }),
        makeTicket({ id: 't2', isRecurring: true, wasSkipped: true }),
      ];
      const result = computeScore(makeInput({ tickets }));
      expect(result.consistency).toBe(-10);
    });

    it('skipped non-recurring task does NOT affect consistency', () => {
      const ticket = makeTicket({ isRecurring: false, wasSkipped: true });
      const result = computeScore(makeInput({ tickets: [ticket] }));
      expect(result.consistency).toBe(0);
    });
  });

  // ─── Speed (lateness) ────────────────────────────────────────────────────────

  describe('speed — lateness penalties', () => {
    it('submitted within deadline → speed = 0 (no penalty)', () => {
      const ticket = makeTicket({
        severity: 'minor',
        openedAt:    new Date('2024-01-10T08:00:00Z'),
        submittedAt: new Date('2024-01-10T10:00:00Z'), // 2h, within 48h
      });
      const result = computeScore(makeInput({ tickets: [ticket] }));
      expect(result.speed).toBe(0);
    });

    it('minor ticket 1 day late → speed = -3', () => {
      const ticket = makeTicket({
        severity: 'minor',
        openedAt:    new Date('2024-01-10T08:00:00Z'),
        submittedAt: new Date('2024-01-13T08:00:00Z'), // 72h = 48h + 24h = 1 day late
      });
      const result = computeScore(makeInput({ tickets: [ticket] }));
      expect(result.speed).toBe(-3);
      expect(result.total).toBe(97);
    });

    it('minor ticket 3 days late → speed = -9', () => {
      const ticket = makeTicket({
        severity: 'minor',
        openedAt:    new Date('2024-01-10T08:00:00Z'),
        submittedAt: new Date('2024-01-15T08:00:00Z'), // 120h = 48h + 72h = 3 days late
      });
      const result = computeScore(makeInput({ tickets: [ticket] }));
      expect(result.speed).toBe(-9);
    });

    it('immediate_interrupt submitted 1 day after 2h deadline → speed = -3', () => {
      const ticket = makeTicket({
        severity: 'immediate_interrupt',
        openedAt:    new Date('2024-01-10T08:00:00Z'),
        submittedAt: new Date('2024-01-11T10:00:00Z'), // 26h = 2h + 24h = 1 day late
      });
      const result = computeScore(makeInput({ tickets: [ticket] }));
      expect(result.speed).toBe(-3);
    });

    it('two late tickets → speed penalties are summed', () => {
      const t1 = makeTicket({ id: 't1', severity: 'minor', openedAt: new Date('2024-01-10T08:00:00Z'), submittedAt: new Date('2024-01-13T08:00:00Z') }); // 1 day late
      const t2 = makeTicket({ id: 't2', severity: 'minor', openedAt: new Date('2024-01-10T08:00:00Z'), submittedAt: new Date('2024-01-14T08:00:00Z') }); // 2 days late
      const result = computeScore(makeInput({ tickets: [t1, t2] }));
      expect(result.speed).toBe(-9); // (1+2) days * 3 = -9
    });

    it('not yet submitted → no speed penalty', () => {
      const ticket = makeTicket({ submittedAt: undefined });
      const result = computeScore(makeInput({ tickets: [ticket] }));
      expect(result.speed).toBe(0);
    });
  });

  // ─── Perfect period bonus ────────────────────────────────────────────────────

  describe('perfect period bonus', () => {
    it('ticket completed on time, no rejections, no skips → +5 bonus', () => {
      const ticket = makeTicket({ events: ['completed'], isRecurring: false, wasSkipped: false });
      const result = computeScore(makeInput({ tickets: [ticket] }));
      expect(result.volume).toBe(5);
      expect(result.total).toBe(105); // 100 + 5 bonus
    });

    it('any rejection → no bonus', () => {
      const ticket = makeTicket({ events: ['rejection'] });
      const result = computeScore(makeInput({ tickets: [ticket] }));
      expect(result.volume).toBe(0);
    });

    it('any skip → no bonus', () => {
      const ticket = makeTicket({ isRecurring: true, wasSkipped: true });
      const result = computeScore(makeInput({ tickets: [ticket] }));
      expect(result.volume).toBe(0);
    });

    it('late submission → no bonus', () => {
      const ticket = makeTicket({
        severity: 'minor',
        openedAt:    new Date('2024-01-10T08:00:00Z'),
        submittedAt: new Date('2024-01-13T08:00:00Z'), // 1 day late
      });
      const result = computeScore(makeInput({ tickets: [ticket] }));
      expect(result.volume).toBe(0);
    });

    it('no tickets → no bonus (nothing was done)', () => {
      const result = computeScore(makeInput());
      expect(result.volume).toBe(0);
    });
  });

  // ─── Combined scenarios ──────────────────────────────────────────────────────

  describe('combined scenarios', () => {
    it('1 rejection + 1 skip: total = 100 - 10 - 5 = 85', () => {
      const tickets = [
        makeTicket({ id: 't1', events: ['rejection'] }),
        makeTicket({ id: 't2', isRecurring: true, wasSkipped: true }),
      ];
      const result = computeScore(makeInput({ tickets }));
      expect(result.total).toBe(85);
    });

    it('score can go negative with many violations', () => {
      const tickets = Array.from({ length: 15 }, (_, i) =>
        makeTicket({ id: `t${i}`, events: ['rejection'] })
      );
      const result = computeScore(makeInput({ tickets }));
      expect(result.total).toBe(100 - 15 * 10); // -50
    });
  });
});
