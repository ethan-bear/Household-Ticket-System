# Household Accountability & Inspection System

A production-quality enforcement and accountability system for a private household. Tracks recurring and one-off tasks (tickets), enforces explicit lifecycle transitions, requires photo evidence for completion, and scores domestic employees on Quality → Consistency → Speed → Volume.

---

## Live Deployment

| Service | URL |
|---|---|
| Frontend | https://household-ticket-system.vercel.app |
| API | https://api-production-36376.up.railway.app |

**Demo logins:**

| Name | Role | Email | Password |
|---|---|---|---|
| Maria | mother (admin) | maria@house.local | maria123 |
| Carlos | father (oversight) | carlos@house.local | carlos123 |
| Rosa | employee (housekeeper) | rosa@house.local | rosa123 |
| Miguel | employee (handyman) | miguel@house.local | miguel123 |
| Luis | employee (cook) | luis@house.local | luis123 |
| Ana | employee (pool) | ana@house.local | ana123 |

---

## Functionality

### Roles

| Role | Capabilities |
|---|---|
| `mother` | Create/close tickets, all reports, full admin |
| `father` | Close tickets, oversight view |
| `employee` | Create tickets, transition to `needs_review`, view own score |

Employees can never close a ticket. RBAC is enforced server-side on every route and service call.

---

### Ticket Lifecycle

```
Open → In Progress → Needs Review → Closed
                   ↗ (Rejected: penalty applied, sent back to In Progress)
Recurring only: Open → Skipped / In Progress → Skipped
```

- **Closed is terminal.** No reopening. If the same issue recurs, a new ticket is created.
- **Rejection** (`needs_review → in_progress`) triggers a quality penalty on the assigned employee.
- **Skipping** requires an authority role and applies a consistency penalty.

---

### Evidence Requirements

- Every ticket completion requires **at least one photo** before transitioning to `needs_review`.
- **Inspection tickets** (`isInspection: true`) require both a `before` photo and an `after` photo.
- The API rejects the transition with a descriptive error if required photos are missing — never a generic 500.

---

### Severity Levels

| Level | Color | Penalty Multiplier | Behavior |
|---|---|---|---|
| `minor` | Green | 1× | Normal flow, 48h deadline |
| `needs_fix_today` | Yellow | 2× | Pinned to top of dashboard, 8h deadline |
| `immediate_interrupt` | Red | 4× | Full-screen overlay + vibration on employee UI, 2h deadline |

Only authority roles can assign `immediate_interrupt` severity.

---

### Scoring Model

Employees are scored weekly across four dimensions:

| Dimension | Weight | Formula |
|---|---|---|
| Quality | 40% | Base 100 − (15 × severity multiplier per rejection) − (10 × multiplier per failed inspection) |
| Consistency | 30% | Base 100 − (50 ÷ total recurring per skip) + 10 bonus for zero skips |
| Speed | 20% | 100 if on time, −5 per hour over deadline (floor −100) |
| Volume | 10% | (tickets completed by user) ÷ (max completed by any user) × 100 |

`total = (quality × 0.40) + (consistency × 0.30) + (speed × 0.20) + (volume × 0.10)`

Scores can go negative. The scoring engine is a pure TypeScript function with zero framework imports — fully unit-tested.

---

### Recurring Tasks

- Templates define: name, description, frequency (`daily | weekly | monthly | custom`), assigned roles, severity, area, category.
- A daily cron job at 06:00 UTC generates ticket instances automatically.
- Skipping must be explicitly actioned by an authority — unactioned overdue instances surface in the weekly report.
- Templates are managed by authority roles only.

---

### Weekly Report (Authority Only)

- Summary: Open / In Progress / Closed / Skipped / Reopened ticket counts
- Per-employee breakdown: completions, skips, rejections, quality penalty, consistency penalty, total penalty
- Repeat issues: tickets in the same area + category as one closed within the last 7 days
- Trends & patterns: overdue tickets, employees with zero completions, most penalized employee, problem area hot spots

---

### Bilingual UI (EN / ES)

- All UI copy uses `react-i18next` — no hardcoded English strings in JSX
- Language preference persisted to `localStorage`
- Employee dashboard: large icon cards, color strip per severity, score gauge — no dense tables
- Authority dashboard: sortable table with filters, scores tab, recurring template management
- `immediate_interrupt` triggers a full-screen `<InterruptAlert>` overlay with `navigator.vibrate`

---

### AI Chat Interface

Bilingual chat powered by `@anthropic-ai/sdk`. Supports four tools:

| Tool | Roles |
|---|---|
| `create_ticket` | All (employees cannot set `immediate_interrupt`) |
| `update_ticket_status` | Employees: `needs_review` only. Authority: all transitions |
| `get_weekly_report` | Authority only |
| `get_employee_score` | Authority: any user. Employees: own score only |

Each tool re-verifies the caller's role server-side. Responses are brief human summaries, never raw DB records.

---

## Full Stack Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Vercel (SPA)                          │
│  React 18 + TypeScript + Vite + Tailwind CSS                │
│  @tanstack/react-query  react-i18next  react-router-dom     │
│  Axios (withCredentials) → JWT httpOnly cookie              │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS (cross-origin, SameSite=None)
┌────────────────────────▼────────────────────────────────────┐
│                    Railway (API)                              │
│  Node.js + Express + TypeScript                             │
│                                                             │
│  Middleware chain:                                          │
│    authenticate() → JWT verify + RevokedToken DB check      │
│    requireRole()  → RBAC factory, 403 on failure           │
│                                                             │
│  Routes (thin — Zod validation only):                       │
│    /api/auth      /api/tickets    /api/photos               │
│    /api/recurring /api/scores     /api/reports  /api/chat   │
│                                                             │
│  Services (business logic):                                 │
│    ticketService   photoService   recurringService          │
│    scoringService  chatService                              │
│                                                             │
│  Domain package (pure functions, zero framework imports):   │
│    ticketStateMachine  scoringEngine  repeatIssueDetector   │
│                                                             │
│  Cron jobs:                                                 │
│    recurringCron (daily 06:00) — generate ticket instances  │
│    tokenCleanupCron (daily 02:00) — purge expired JWTs      │
└────────────┬──────────────────────────┬─────────────────────┘
             │                          │
┌────────────▼────────┐     ┌───────────▼──────────┐
│  PostgreSQL 16       │     │  Cloudinary          │
│  (Railway managed)   │     │  (photo storage)     │
│                      │     │  public_id → s3Key   │
│  8 models:           │     └──────────────────────┘
│  User                │
│  Ticket              │     ┌──────────────────────┐
│  TicketPhoto         │     │  Anthropic API       │
│  TicketAuditLog*     │     │  claude-haiku-4-5    │
│  RecurringTemplate   │     │  (chat interface)    │
│  RecurringInstance   │     └──────────────────────┘
│  ScoreRecord         │
│  RevokedToken        │
│                      │
│  * immutable forever │
│    no cascade delete │
└─────────────────────┘
```

### Key Design Decisions

**Monorepo (pnpm workspaces):** Three packages — `apps/api`, `apps/web`, `packages/domain`. The domain package is framework-free and fully unit-testable in isolation.

**Pure domain logic:** `ticketStateMachine`, `scoringEngine`, and `repeatIssueDetector` have zero imports from Express, Prisma, or any framework. Business rules live here; infrastructure is kept out.

**No Redis:** Token revocation uses a `RevokedToken` Postgres table with a daily cleanup cron. Sufficient for household scale, removes an entire infrastructure dependency.

**No Socket.io:** Real-time `immediate_interrupt` alerts use SSE (Server-Sent Events) — unidirectional server→client push is all that's needed.

**JWT + httpOnly cookie:** Protects against XSS. `SameSite=None; Secure` in production allows cross-origin requests between Vercel and Railway.

**Audit log immutability:** `TicketAuditLog` has no cascade delete and no soft-delete. Every state change is permanently recorded.

---

## Project Structure

```
/
├── apps/
│   ├── api/src/
│   │   ├── config/env.ts          # Zod env validation at startup
│   │   ├── middleware/            # auth.ts, rbac.ts
│   │   ├── routes/                # auth, tickets, photos, recurring, scores, reports, chat
│   │   ├── services/              # ticketService, photoService, scoringService, recurringService, chatService
│   │   ├── jobs/                  # recurringCron.ts, tokenCleanupCron.ts
│   │   └── lib/                   # prisma.ts
│   └── web/src/
│       ├── i18n/                  # en.json, es.json
│       ├── api/client.ts          # Axios instance with JWT interceptor
│       ├── hooks/                 # useTickets, useScore
│       ├── components/            # SeverityBadge, StatusChip, PhotoUpload, InterruptAlert
│       ├── pages/                 # LoginPage, EmployeeDashboard, AuthorityDashboard, WeeklyReport, ChatPage
│       └── contexts/AuthContext.tsx
├── packages/domain/src/
│   ├── ticketStateMachine.ts      # Pure state machine, TicketTransitionError
│   ├── scoringEngine.ts           # Pure scoring function, 40/30/20/10 weights
│   ├── repeatIssueDetector.ts     # Pure repeat-issue detection, 7-day window
│   └── __tests__/                 # 47 Vitest unit tests (all passing)
├── prisma/
│   ├── schema.prisma              # 8 models, 5 enums
│   ├── migrations/                # Committed migration files
│   └── seed.ts                    # 6 users, 2 templates, 5 sample tickets
├── docs/
│   └── architecture.md            # Architectural brief
├── CLAUDE.md                      # Project spec and instructions
├── LEARNING.md                    # Architecture decisions and lessons learned
├── railway.json                   # Railway build + deploy config
├── vercel.json                    # Vercel build + SPA rewrites
└── docker-compose.yml             # PostgreSQL 16 + MinIO (local dev)
```

---

## Local Development

```bash
# Prerequisites: Docker Desktop running, Node.js 18+, pnpm

pnpm install

# Start Postgres + MinIO
docker-compose up -d

# Run migrations and seed
pnpm db:migrate
pnpm db:seed

# Start API (:4000) and Web (:5173) with hot reload
pnpm dev

# Run domain unit tests (47 tests)
pnpm test
```

**Environment variables** — copy `.env.example` to `.env` and fill in:
- `DATABASE_URL` — Postgres connection string
- `JWT_SECRET` — 32+ char random string
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — from Cloudinary dashboard
- `ANTHROPIC_API_KEY` — from console.anthropic.com
