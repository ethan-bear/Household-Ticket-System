# Claude Code Meta Prompt — Household Accountability & Inspection System

Use this prompt to initialize Claude Code on this project. Paste it as your first message after opening the repo in Claude Code.

---

## Prompt

```
You are the lead engineer on a production-quality household accountability and inspection system. Your task is to scaffold, implement, and deploy this application end-to-end. Read CLAUDE.md fully before writing a single line of code — all architectural decisions, domain rules, and tech stack choices are documented there and must be followed precisely.

## Your First Actions (Do These in Order)

1. Read CLAUDE.md completely.
2. Confirm you understand the ticket lifecycle, role permissions, evidence rules, and scoring model before proceeding.
3. Set up the monorepo structure as defined in CLAUDE.md under "Project Structure."
4. Initialize the database schema (Prisma) covering: User, Role, Ticket, TicketPhoto, TicketAuditLog, RecurringTemplate, RecurringInstance, ScoreRecord.
5. Write the domain package first — pure TypeScript modules with zero framework dependencies:
   - `ticketStateMachine.ts` — enforces all valid state transitions; throws on invalid.
   - `scoringEngine.ts` — computes quality, consistency, speed, volume scores from ticket history.
   - `repeatIssueDetector.ts` — flags tickets matching area + category within a 7-day window.
6. Write unit tests for all three domain modules before building any API routes.
7. Build the API layer with full RBAC middleware on every route.
8. Build the frontend, prioritizing the employee dashboard (icon-heavy, bilingual, severity-colored) and the authority dashboard (weekly report, trend view).
9. Implement the seed script for all dummy users defined in CLAUDE.md.
10. Deploy and return a public URL.

## Constraints You Must Never Violate

- Employees cannot close tickets. Enforce server-side.
- Photo evidence is required before any ticket can transition to `needs_review`. Reject at the API layer if missing.
- Scoring logic must live in the domain package — never inline it in a route or component.
- Every ticket state change must write an immutable audit log entry.
- All state transition errors must return a descriptive error message (not a generic 500).
- RBAC must be enforced on the server — never rely on client-side role checks for security.

## Domain Rules Quick Reference

**Ticket states:** Open → In Progress → Needs Review → Closed (Skipped for recurring only)

**Who can close:** mother, father only.

**Severity levels:** minor | needs_fix_today | immediate_interrupt
- immediate_interrupt: max penalty, must visually interrupt employee UI, only authority roles can assign.

**Scoring priority:** Quality → Consistency → Speed → Volume (scores can go negative).

**Repeat issue:** Same area + category within 7 days of a previous ticket = repeat flag.

**Photo rules:**
- Standard ticket: 1+ completion photo required.
- Inspection ticket: before photo + after photo required.

## Code Quality Standards

- TypeScript strict mode everywhere. No `any`.
- All async functions must handle errors explicitly — no unhandled promise rejections.
- API responses follow a consistent envelope: `{ success: boolean, data?: T, error?: string }`.
- Use Zod for all request body validation at the API boundary.
- Environment variables must be validated at startup (use `zod` or `envalid`).
- Write descriptive commit messages as you complete each phase.

## What to Build First (Suggested Order)

1. Prisma schema + migrations
2. Domain modules + unit tests
3. Auth (JWT, role middleware)
4. Ticket CRUD API + state machine integration
5. Photo upload endpoint (S3)
6. Recurring task engine (cron job or scheduled function)
7. Scoring endpoint
8. Weekly report endpoint
9. Frontend: auth flow
10. Frontend: employee dashboard
11. Frontend: authority dashboard + reports
12. Seed script
13. Deploy
14. (Optional) Bilingual chat interface with Anthropic tool use

## Deliverables to Produce

- [ ] Deployed public URL
- [ ] GitHub repository with clean commit history
- [ ] Seed script that creates all dummy personas
- [ ] `docs/architecture.md` — document your decisions, tradeoffs, what you'd change with more time

## Questions to Answer in docs/architecture.md

- Why did you choose this database schema over alternatives?
- How does the state machine prevent invalid transitions?
- What tradeoffs did you make in the scoring model?
- How would you scale the recurring task generator if this managed 10,000 households?
- What would you add first with another week of time?

## When You're Unsure

- Default to stricter enforcement over flexibility — this is an accountability system.
- Prefer explicit error messages over silent failures.
- Prefer simple, readable code over clever abstractions.
- Document tradeoffs in inline comments when you make a judgment call.

Begin now. Start with step 1: read CLAUDE.md.
```

---

## Usage Notes

**When to use this prompt:**
Paste this as the very first message in a new Claude Code session after cloning the repo. Claude Code will read `CLAUDE.md` from the filesystem as part of its context.

**If continuing a session:**
You can use a shorter continuation prompt:

```
Continue from where we left off. Check CLAUDE.md for any domain rules before making changes.
Focus next on: [specific task]
```

**For debugging sessions:**

```
Something is wrong with [feature]. Review CLAUDE.md's domain rules section first, 
then look at [file/route]. The expected behavior is [X]. The actual behavior is [Y].
```

**For the optional chat interface:**

```
We're now implementing the optional bilingual chat interface described in CLAUDE.md.
Use the Anthropic API with tool use. Define tools for: create_ticket, update_ticket_status, 
get_weekly_report, get_employee_score. Enforce role permissions inside each tool handler.
Support English/Spanish switching via a session preference. Start with the tool definitions.
```
