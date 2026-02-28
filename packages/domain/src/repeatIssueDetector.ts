// Repeat Issue Detector
// Pure function — no framework imports.
// Flags tickets created in the same area+category as a ticket closed within 7 days.

export interface ClosedTicketSummary {
  id: string;
  area: string;
  category: string;
  closedAt: Date;
}

export interface NewTicketInfo {
  area: string;
  category: string;
  createdAt: Date;
}

export interface RepeatIssueResult {
  isRepeat: boolean;
  previousTicketId?: string;
}

const REPEAT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Checks whether a new ticket is a repeat of a recently closed issue.
 * Returns { isRepeat: true, previousTicketId } if a match is found within 7 days.
 * Returns { isRepeat: false } otherwise.
 *
 * @param newTicket - The ticket being created
 * @param recentClosedTickets - All tickets to check against (pre-filtered by caller or not)
 */
export function isRepeatIssue(
  newTicket: NewTicketInfo,
  recentClosedTickets: ClosedTicketSummary[]
): RepeatIssueResult {
  const windowStart = new Date(newTicket.createdAt.getTime() - REPEAT_WINDOW_MS);

  const match = recentClosedTickets.find(
    (t) =>
      t.area.toLowerCase() === newTicket.area.toLowerCase() &&
      t.category.toLowerCase() === newTicket.category.toLowerCase() &&
      t.closedAt >= windowStart &&
      t.closedAt <= newTicket.createdAt
  );

  if (match) {
    return { isRepeat: true, previousTicketId: match.id };
  }

  return { isRepeat: false };
}
