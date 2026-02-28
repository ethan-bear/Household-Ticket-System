import { describe, it, expect } from 'vitest';
import {
  validateTransition,
  TicketTransitionError,
} from '../ticketStateMachine';
import type { TicketContext } from '../ticketStateMachine';

const baseTicket: TicketContext = {
  id: 'ticket-1',
  status: 'open',
  isRecurring: false,
  severity: 'minor',
};

const recurringTicket: TicketContext = {
  ...baseTicket,
  isRecurring: true,
};

describe('ticketStateMachine', () => {
  // ─── Valid transitions ─────────────────────────────────────────────────────

  describe('valid transitions', () => {
    it('open → in_progress (any role)', () => {
      const result = validateTransition('open', 'in_progress', 'employee', baseTicket);
      expect(result.isRejection).toBe(false);
    });

    it('in_progress → needs_review (any role)', () => {
      const result = validateTransition('in_progress', 'needs_review', 'employee', {
        ...baseTicket,
        status: 'in_progress',
      });
      expect(result.isRejection).toBe(false);
    });

    it('needs_review → closed (mother)', () => {
      const result = validateTransition('needs_review', 'closed', 'mother', {
        ...baseTicket,
        status: 'needs_review',
      });
      expect(result.isRejection).toBe(false);
    });

    it('needs_review → closed (father)', () => {
      const result = validateTransition('needs_review', 'closed', 'father', {
        ...baseTicket,
        status: 'needs_review',
      });
      expect(result.isRejection).toBe(false);
    });

    it('needs_review → in_progress (rejection by mother)', () => {
      const result = validateTransition('needs_review', 'in_progress', 'mother', {
        ...baseTicket,
        status: 'needs_review',
      });
      expect(result.isRejection).toBe(true);
    });

    it('needs_review → in_progress (rejection by father)', () => {
      const result = validateTransition('needs_review', 'in_progress', 'father', {
        ...baseTicket,
        status: 'needs_review',
      });
      expect(result.isRejection).toBe(true);
    });

    it('open → skipped (recurring ticket, mother)', () => {
      const result = validateTransition('open', 'skipped', 'mother', recurringTicket);
      expect(result.isRejection).toBe(false);
    });

    it('in_progress → skipped (recurring ticket, father)', () => {
      const result = validateTransition('in_progress', 'skipped', 'father', {
        ...recurringTicket,
        status: 'in_progress',
      });
      expect(result.isRejection).toBe(false);
    });
  });

  // ─── Invalid transitions ────────────────────────────────────────────────────

  describe('invalid transitions — throws TicketTransitionError', () => {
    it('closed → anything throws', () => {
      expect(() =>
        validateTransition('closed', 'open', 'mother', { ...baseTicket, status: 'closed' })
      ).toThrow(TicketTransitionError);
    });

    it('closed → in_progress throws (closed is terminal)', () => {
      expect(() =>
        validateTransition('closed', 'in_progress', 'mother', {
          ...baseTicket,
          status: 'closed',
        })
      ).toThrow(TicketTransitionError);
    });

    it('skipped → anything throws', () => {
      expect(() =>
        validateTransition('skipped', 'open', 'mother', {
          ...baseTicket,
          status: 'skipped',
        })
      ).toThrow(TicketTransitionError);
    });

    it('open → closed throws (not a valid base transition)', () => {
      expect(() =>
        validateTransition('open', 'closed', 'mother', baseTicket)
      ).toThrow(TicketTransitionError);
    });

    it('in_progress → open throws', () => {
      expect(() =>
        validateTransition('in_progress', 'open', 'employee', {
          ...baseTicket,
          status: 'in_progress',
        })
      ).toThrow(TicketTransitionError);
    });
  });

  // ─── RBAC checks ───────────────────────────────────────────────────────────

  describe('RBAC: employee cannot perform authority transitions', () => {
    it('employee cannot close a ticket', () => {
      expect(() =>
        validateTransition('needs_review', 'closed', 'employee', {
          ...baseTicket,
          status: 'needs_review',
        })
      ).toThrow(TicketTransitionError);
    });

    it('employee cannot reject (needs_review → in_progress)', () => {
      expect(() =>
        validateTransition('needs_review', 'in_progress', 'employee', {
          ...baseTicket,
          status: 'needs_review',
        })
      ).toThrow(TicketTransitionError);
    });

    it('employee cannot skip a recurring ticket', () => {
      expect(() =>
        validateTransition('open', 'skipped', 'employee', recurringTicket)
      ).toThrow(TicketTransitionError);
    });
  });

  // ─── Skip rules ─────────────────────────────────────────────────────────────

  describe('skip rules', () => {
    it('non-recurring ticket cannot be skipped', () => {
      expect(() =>
        validateTransition('open', 'skipped', 'mother', baseTicket)
      ).toThrow(TicketTransitionError);
    });

    it('recurring ticket can be skipped by mother', () => {
      expect(() =>
        validateTransition('open', 'skipped', 'mother', recurringTicket)
      ).not.toThrow();
    });
  });

  // ─── Error message quality ─────────────────────────────────────────────────

  describe('error messages are descriptive', () => {
    it('closed error mentions ticket id', () => {
      try {
        validateTransition('closed', 'open', 'mother', { ...baseTicket, id: 'abc-123', status: 'closed' });
      } catch (e) {
        expect(e).toBeInstanceOf(TicketTransitionError);
        expect((e as Error).message).toContain('abc-123');
        expect((e as Error).message).toContain('closed');
      }
    });

    it('rbac error mentions actor role', () => {
      try {
        validateTransition('needs_review', 'closed', 'employee', {
          ...baseTicket,
          status: 'needs_review',
        });
      } catch (e) {
        expect(e).toBeInstanceOf(TicketTransitionError);
        expect((e as Error).message).toContain('employee');
      }
    });
  });
});
