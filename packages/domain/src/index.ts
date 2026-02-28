// Domain package exports
export { validateTransition, TicketTransitionError } from './ticketStateMachine';
export type { Role, TicketStatus, Severity, TicketContext, TransitionResult } from './ticketStateMachine';

export { computeScore } from './scoringEngine';
export type { ScoringInput, ScoreBreakdown, TicketHistory, Period, TicketEventType } from './scoringEngine';

export { isRepeatIssue } from './repeatIssueDetector';
export type { NewTicketInfo, ClosedTicketSummary, RepeatIssueResult } from './repeatIssueDetector';
