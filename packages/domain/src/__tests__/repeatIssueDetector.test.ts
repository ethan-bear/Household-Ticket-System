import { describe, it, expect } from 'vitest';
import { isRepeatIssue } from '../repeatIssueDetector';
import type { ClosedTicketSummary, NewTicketInfo } from '../repeatIssueDetector';

const now = new Date('2024-01-15T12:00:00Z');

function daysAgo(days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

const closedRecently: ClosedTicketSummary = {
  id: 'old-ticket-1',
  area: 'kitchen',
  category: 'cleaning',
  closedAt: daysAgo(3), // 3 days ago
};

const newTicket: NewTicketInfo = {
  area: 'kitchen',
  category: 'cleaning',
  createdAt: now,
};

describe('repeatIssueDetector', () => {
  it('same area+category within 7 days → isRepeat=true', () => {
    const result = isRepeatIssue(newTicket, [closedRecently]);
    expect(result.isRepeat).toBe(true);
    expect(result.previousTicketId).toBe('old-ticket-1');
  });

  it('same area+category exactly 7 days ago → isRepeat=true (boundary)', () => {
    const exactly7Days: ClosedTicketSummary = {
      ...closedRecently,
      id: 'boundary-ticket',
      closedAt: daysAgo(7),
    };
    const result = isRepeatIssue(newTicket, [exactly7Days]);
    expect(result.isRepeat).toBe(true);
  });

  it('same area+category more than 7 days ago → isRepeat=false', () => {
    const old: ClosedTicketSummary = {
      ...closedRecently,
      closedAt: daysAgo(8), // 8 days ago — outside window
    };
    const result = isRepeatIssue(newTicket, [old]);
    expect(result.isRepeat).toBe(false);
    expect(result.previousTicketId).toBeUndefined();
  });

  it('different area → isRepeat=false', () => {
    const differentArea: ClosedTicketSummary = {
      ...closedRecently,
      area: 'bathroom',
    };
    const result = isRepeatIssue(newTicket, [differentArea]);
    expect(result.isRepeat).toBe(false);
  });

  it('different category → isRepeat=false', () => {
    const differentCategory: ClosedTicketSummary = {
      ...closedRecently,
      category: 'mopping',
    };
    const result = isRepeatIssue(newTicket, [differentCategory]);
    expect(result.isRepeat).toBe(false);
  });

  it('empty recent tickets → isRepeat=false', () => {
    const result = isRepeatIssue(newTicket, []);
    expect(result.isRepeat).toBe(false);
  });

  it('case-insensitive area+category comparison', () => {
    const upperCase: ClosedTicketSummary = {
      ...closedRecently,
      area: 'KITCHEN',
      category: 'CLEANING',
    };
    const result = isRepeatIssue(newTicket, [upperCase]);
    expect(result.isRepeat).toBe(true);
  });

  it('returns the most recent matching ticket (first found)', () => {
    const older: ClosedTicketSummary = {
      id: 'old-1',
      area: 'kitchen',
      category: 'cleaning',
      closedAt: daysAgo(6),
    };
    const newer: ClosedTicketSummary = {
      id: 'new-1',
      area: 'kitchen',
      category: 'cleaning',
      closedAt: daysAgo(2),
    };
    // Pass newer first — should return it
    const result = isRepeatIssue(newTicket, [newer, older]);
    expect(result.previousTicketId).toBe('new-1');
  });
});
