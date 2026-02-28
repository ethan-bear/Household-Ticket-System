# CLAUDE.md — Household Accountability & Inspection System

This file provides context for Claude Code when working in this repository.
Read it fully before writing or modifying any code.

---

## Project Purpose

This is a **production-quality enforcement and accountability system** for a private household. It is NOT a task manager or collaborative planning tool. Every feature decision should reinforce strict rule enforcement, auditability, and role-based authority.

The system tracks recurring and one-off tasks (called tickets), enforces explicit lifecycle transitions, requires photo evidence for completion, and scores domestic employees on Quality → Consistency → Speed → Volume (priority order).

---

## User Roles

| Role | Key Permissions |
|---|---|
| `mother` | Create tickets, close tickets, view all reports, full admin |
| `father` | Close tickets, high-level oversight view |
| `employee` | Create tickets, transition to `needs_review` only, view own score |

**Never allow an employee to close a ticket.** Role checks must be enforced server-side — never trust the client.

---

## Ticket Lifecycle

```
Open → In Progress → Needs Review → Closed
                   ↗ (Rejected: authority sends back, penalty applied)
Recurring tasks only: Open → Skipped
```

### State Transition Table (Canonical — Do Not Deviate)

| From | To | Who | Notes |
|---|---|---|---|
| `open` | `in_progress` | any authenticated user | — |
| `in_progress` | `needs_review` | any authenticated user | Photos must be present or API rejects |
| `needs_review` | `closed` | mother, father only | Ticket resolved |
| `needs_review` | `in_progress` | mother, father only | **Rejection path** — authority not satisfied; triggers penalty |
| `open` | `skipped` | mother, father only | Recurring tickets only |
| `in_progress` | `skipped` | mother, father only | Recurring tickets only |

### Closed Is Terminal

`closed` has **no outgoing transitions**. A closed ticket cannot be reopened under any circumstances. If the same issue recurs, create a new ticket. This preserves audit integrity. Any attempt to transition out of `closed` must throw `TicketTransitionError`.

### What "Reopen" Means in This System

"Reopen" means exactly one thing: an authority transitions `needs_review → in_progress` because submitted work was rejected. It does **not** mean reopening a closed ticket — that path does not exist.

**Penalty on rejection:** When `needs_review → in_progress` occurs, `ticketService.ts` automatically applies a quality penalty to the assigned employee and writes an audit log entry with `note: "rejected"`. The state machine only validates transitions — it never applies side effects.

**Repeat issue detection:** When a new ticket is created in the same `area` + `category` as a ticket closed within the last 7 days, flag it as a repeat issue. This is a creation-time check in `ticketService.ts`, not a transition check.

---

## Evidence Rules (Strictly Enforced)

- Every ticket completion requires **at least one photo** before transitioning to `needs_review`.
- Inspection tickets (`isInspection: true`) require **both a `before` photo AND an `after` photo**.
- The backend must reject a `needs_review` transition if required photos are missing — return a descriptive error, never a generic 500.
- Store photos with: `ticketId`, `uploaderId`, `url`, `s3Key`, `photoType` (`before` | `after` | `completion`), `createdAt`.

---

## Severity Levels

| Level | Penalty Multiplier | Key Behavior |
|---|---|---|
| `minor` | 1× | Normal flow |
| `needs_fix_today` | 2× | Pinned to top of employee dashboard |
| `immediate_interrupt` | 4× | Full-screen overlay on employee UI; only mother/father may assign |

The severity multiplier applies to all penalty calculations in the scoring engine.

---

## Scoring Model

### Weights (Fixed — Do Not Change)

| Dimension | Weight |
|---|---|
| Quality | **40%** |
| Consistency | **30%** |
| Speed | **20%** |
| Volume | **10%** |

**Formula:** `total = (quality × 0.40) + (consistency × 0.30) + (speed × 0.20) + (volume × 0.10)`

Each dimension starts at a base of 100. Penalties subtract from it. Scores can go **negative**.

### Quality (40%)

- Base: 100
- Rejection (`needs_review → in_progress`): −15 × severity multiplier
- Failed inspection (authority closes with `rejectedInspection: true`): −10 × severity multiplier
- Quality only degrades — there are no positive quality events.

### Consistency (30%)

- Base: 100
- Each skipped recurring instance: −(50 ÷ total recurring tickets in period)
- Perfect streak (zero skips in period): +10 bonus

### Speed (20%)

Deadlines by severity:

| Severity | Deadline |
|---|---|
| `immediate_interrupt` | 2 hours |
| `needs_fix_today` | 8 hours |
| `minor` | 48 hours |

- Completed within deadline: 100
- Each hour over deadline: −5 (floor: −100)
- `minor` tickets with no `dueAt`: 100 if completed same calendar day, else 80.

### Volume (10%)

- `(tickets completed by this user in period) ÷ (max completed by any user in period) × 100`
- Range: 0–100. Least weighted dimension — do not over-optimize for it.

### Scoring Engine Contract

`packages/domain/src/scoringEngine.ts` is a **pure function**. It takes `TicketHistory[]` and a `Period` and returns `ScoreBreakdown`. Zero imports from Express, Prisma, or any framework. Persistence is handled by `scoringService.ts` in the API layer.

---

## Recurring Tasks

- Templates define: `name`, `description`, `frequency` (`daily | weekly | monthly | custom`), `assignedRoles` (native Postgres array: `Role[]`), `severityDefault`, `area`, `category`.
- Ticket instances are generated automatically by a daily cron job.
- Skipping must be explicitly actioned by an authority — absence is not a skip. Unactioned overdue instances surface in the weekly report.
- Templates are managed by authority roles only.

---

## Data Model Notes

### User — `specialty` Field

```prisma
model User {
  id           String   @id @default(cuid())
  name         String
  email        String   @unique
  passwordHash String
  role         Role
  specialty    String?  // display only: "housekeeper", "handyman", "cook", "pool maintenance"
  createdAt    DateTime @default(now())
}
```

`specialty` is display-only and does not drive permissions. `role` drives all access control.

### RecurringTemplate — `assignedRoles` Field

```prisma
model RecurringTemplate {
  assignedRoles Role[]  @default([])
  // ...
}
```

Use the **native Prisma scalar list** (`Role[]`) backed by a Postgres array column. Do **not** use a `Json` field, a separate join table, or a comma-separated string. Prisma handles this natively.

### Auth — No Redis, Use `RevokedToken` Table

```prisma
model RevokedToken {
  id        String   @id @default(cuid())
  jti       String   @unique   // JWT ID claim
  expiresAt DateTime            // for periodic cleanup
  createdAt DateTime @default(now())
}
```

There is **no Redis** in this project. Auth uses JWT (httpOnly cookie) + DB-based token revocation. On logout, write the JWT's `jti` claim to `RevokedToken`. On each authenticated request, check the token is not in this table. A daily cron cleans up expired rows. This is sufficient for this project's scale and removes an entire infrastructure dependency.

### AuditLog — Immutable Forever

`TicketAuditLog` has no cascade delete and no soft-delete. Never write a migration that drops or truncates this table.

---

## Architecture Principles

- **RBAC enforced server-side** on every mutation and sensitive read.
- **State machine** throws `TicketTransitionError` with a descriptive message on any invalid transition — never silently succeeds or returns a generic 500.
- **Audit log** on every ticket state change: actor, from-state, to-state, timestamp, optional note.
- **Scoring engine** is a pure function — no side effects, no framework imports, fully unit-testable.
- **Repeat-issue detector** is a pure function — takes a new ticket + recent closed tickets, returns `{ isRepeat, previousTicketId? }`.
- **Thin routes** — routes validate input with Zod and call services. No business logic in route handlers.
- **No Redis. No Socket.io.**

---

## Tech Stack (Fixed — Do Not Change Without Discussion)

- **Frontend**: React + TypeScript, Tailwind CSS, `@tanstack/react-query`, `react-i18next`, `react-router-dom`
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL 16 + Prisma ORM
- **Auth**: JWT (httpOnly cookie) + `RevokedToken` DB table
- **File storage**: MinIO locally (Docker Compose), AWS S3 or Cloudflare R2 in production
- **Real-time alerts**: Server-Sent Events (SSE) for `immediate_interrupt` — not Socket.io
- **Testing**: Vitest for domain unit tests
- **Deployment**: Railway (API + Postgres), Vercel (frontend)

---

## Low-Literacy / Bilingual UI Requirements

- Employee-facing views must prioritize **icons over text**.
- All UI copy uses `react-i18next` with `apps/web/src/i18n/en.json` and `es.json`. No hardcoded English strings in JSX.
- Color-coded severity everywhere: green (`minor`), yellow (`needs_fix_today`), red (`immediate_interrupt`).
- `immediate_interrupt` triggers a full-screen `<InterruptAlert>` overlay with `navigator.vibrate` if available.
- Language preference persisted to `localStorage`.
- Employee dashboard: large icon cards, color strip per severity, score as a colored gauge. No dense tables.
- Authority dashboard: table view with filters, report tab, recurring template management.

---

## Project Structure

```
/
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── config/env.ts          # Zod env validation at startup
│   │       ├── middleware/            # auth.ts, rbac.ts
│   │       ├── routes/                # auth, tickets, photos, recurring, scores, reports, chat
│   │       ├── services/              # ticketService, photoService, scoringService, recurringService, chatService
│   │       ├── jobs/                  # recurringCron.ts, tokenCleanupCron.ts
│   │       └── lib/                   # prisma.ts, s3.ts
│   └── web/
│       └── src/
│           ├── i18n/                  # en.json, es.json
│           ├── api/client.ts          # Axios instance with JWT interceptor
│           ├── hooks/                 # useAuth, useTickets, useScore
│           ├── components/            # SeverityBadge, StatusChip, PhotoUpload, InterruptAlert
│           ├── pages/                 # LoginPage, EmployeeDashboard, AuthorityDashboard, TicketDetail, WeeklyReport, ChatPage
│           └── contexts/AuthContext.tsx
├── packages/
│   └── domain/
│       └── src/
│           ├── ticketStateMachine.ts
│           ├── scoringEngine.ts
│           ├── repeatIssueDetector.ts
│           └── __tests__/
├── prisma/
│   └── schema.prisma
├── docs/
│   └── architecture.md
├── docker-compose.yml             # Postgres 16 + MinIO
├── pnpm-workspace.yaml
└── CLAUDE.md
```

---

## Key Commands

```bash
pnpm install

pnpm dev            # API :4000, Web :5173 (hot reload)

pnpm db:migrate     # Prisma migrations
pnpm db:seed        # Seed all dummy users + sample data
pnpm db:studio      # Prisma Studio

pnpm test           # Vitest — domain unit tests
pnpm test:e2e       # Playwright (optional)

pnpm build
pnpm start
```

---

## Dummy Users (Seed Required)

| Name | Role | Email | Password | Specialty |
|---|---|---|---|---|
| Maria | mother | `maria@house.local` | `maria123` | — |
| Carlos | father | `carlos@house.local` | `carlos123` | — |
| Rosa | employee | `rosa@house.local` | `rosa123` | housekeeper |
| Miguel | employee | `miguel@house.local` | `miguel123` | handyman |
| Luis | employee | `luis@house.local` | `luis123` | cook |
| Ana | employee | `ana@house.local` | `ana123` | pool maintenance |

Also seed: 2 recurring templates (daily cleaning, weekly pool check) and at least 4 open tickets in varied states for demo purposes.

---

## Non-Goals

- No free-form chat (except the optional AI interface)
- No collaborative comments or discussion threads
- No passive task lists — everything is enforced
- No features that allow employees to bypass state transitions
- No Redis
- No Socket.io

---

## Optional Bonus: Bilingual Chat Interface

Use `@anthropic-ai/sdk` in `chatService.ts`. Define four tools:

```
create_ticket(title, description, area, category, severity, assignedUserId, isInspection)
update_ticket_status(ticketId, newStatus, note)
get_weekly_report(weekOffset?)
get_employee_score(userId)
```

Each tool handler must re-verify `req.user.role` before executing — do not rely on route middleware alone. Employees may only call `create_ticket` and `get_employee_score` (their own `userId` only). Responses must be brief human summaries, never raw DB records. Language is set per session via `language: 'en' | 'es'` in the request body.

---

## Evaluation Priorities (In Order)

1. Rule enforcement rigor — state transitions, RBAC, evidence requirements, penalty application
2. Domain modeling clarity — clean schema, well-typed, intentional decisions
3. Code organization — thin routes, domain in packages, services orchestrate
4. Production deployment quality
5. Documentation depth (`docs/architecture.md` must answer all 5 questions from the meta prompt)
6. Edge case handling
7. (Optional) Chat interface quality and role-scoping

