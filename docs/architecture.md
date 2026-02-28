# Household Accountability & Inspection System — Architecture

## 1. Why did you choose this database schema over alternatives?

### Role on User (not a permissions table)
`role` is stored as a Postgres enum directly on `User` (`mother | father | employee`). At household scale (2-6 users), a `roles` join table or a permissions matrix adds indirection with zero benefit. The enum is enforced by Prisma at the ORM level and re-verified server-side on every mutation via `requireRole()` middleware.

### RecurringTemplate.assignedRoles — Native Postgres Array
`assignedRoles` uses a `Role[]` scalar list (native Postgres array column), **not** a join table, a JSON column, or a comma-separated string.

- **Join table alternative rejected**: Requires an extra model (`TemplateRole`), more migrations, and N+1 query patterns when listing templates. Prisma's `include` on a join table returns nested arrays, adding serialization complexity for no gain.
- **JSON column alternative rejected**: Untyped at the DB level, not indexable, no enum enforcement. Prisma's scalar list enforces the `Role` enum at write time and generates native Postgres array operators for filtering (`@> ARRAY['employee']::role[]`).

### AuditLog — No Cascade Delete, No Soft Delete
`TicketAuditLog` has no `onDelete: Cascade` and no `deletedAt` column. Once written, a log entry is immutable forever. If a ticket could cascade-delete its audit entries, the enforcement history would disappear. We considered a separate event-sourced `TicketHistory` store but rejected it as over-engineering: the audit log already captures every state transition with actor + timestamp.

### RevokedToken — DB-Based JWT Invalidation (No Redis)
We use a `RevokedToken` table (`jti UNIQUE`, `expiresAt`) instead of Redis.

- **Redis alternative rejected**: Adds an infrastructure dependency (container, persistent volume, connection management). At household scale (<100 tokens/day) a Postgres lookup on an indexed `jti` column is microseconds. A daily cron (`tokenCleanupCron.ts`) deletes expired rows to keep the table small.
- **Short-lived token alternative rejected**: Short expiry (e.g., 15 minutes) + refresh tokens adds frontend complexity (token refresh interceptors, race conditions). The current 7-day cookie with DB-backed revocation is simpler and fully supports the "logout everywhere" requirement.

### Ticket.isRepeatIssue — Denormalized at Creation Time
`isRepeatIssue: Boolean` and `previousTicketId: String?` are written once at ticket creation by the `repeatIssueDetector` pure function. We do not recompute at read time because:
- Report queries would need to cross-reference every ticket against all closed tickets in a 7-day window — expensive at scale
- The creation-time check is a natural place to capture this: the information is relevant when the ticket is opened, not when it is displayed
- Denormalization is safe here because the flag is immutable after creation (repeat status doesn't change retroactively)

---

## 2. How does the state machine prevent invalid transitions?

The state machine is a **pure function** in `packages/domain/src/ticketStateMachine.ts` with zero imports from Express, Prisma, or any framework. Enforcement is layered:

```
Route Handler (Express)
    │  Zod validates request body shape
    ▼
ticketService.ts
    │  Fetches ticket + photos from DB
    ▼
validateTransition(from, to, actorRole, ticket)   ← pure domain function
    │── THROWS TicketTransitionError if any rule is violated
    │── Returns { isRejection: boolean } on success
    ▼
Photo requirement check (service layer)
    │  needs_review requires ≥1 photo; inspection needs before+after
    ▼
Prisma ticket.update()   ← only reached if no throw
    ▼
TicketAuditLog.create()   ← always written after successful transition
```

### Rules enforced inside validateTransition

| Check | Mechanism |
|---|---|
| Terminal states (`closed`, `skipped`) | Immediate throw before any map lookup |
| Valid transition graph | `VALID_TRANSITIONS` record: `from → allowed[]` |
| Skip only for recurring tickets | Guard: `to === 'skipped' && !ticket.isRecurring` |
| Authority-only transitions | `AUTHORITY_ONLY_TRANSITIONS` list checked against actor role |

### closed Is Truly Terminal

```typescript
if (from === 'closed') {
  throw new TicketTransitionError(
    `Ticket ${ticket.id} is closed. Closed tickets have no outgoing transitions.`
  );
}
```

This runs **before** any transition map lookup. No code path can exit `closed`. If the same issue recurs, a new ticket is created — this is enforced by the domain rule and surfaced as the `isRepeatIssue` flag.

### Error surface

`TicketTransitionError` is caught in the route handler and mapped to **HTTP 422 Unprocessable Entity** with the full descriptive message. Callers always receive a human-readable explanation — never a generic 500.

---

## 3. What tradeoffs did you make in the scoring model?

### Weight rationale

| Dimension | Weight | Reasoning |
|---|---|---|
| Quality | 40% | Rejected work wastes authority time and signals carelessness |
| Consistency | 30% | Reliable execution of recurring tasks is the core job definition |
| Speed | 20% | Timely completion matters but never at the cost of quality |
| Volume | 10% | Least weight prevents gaming via quantity over quality |

Formula: `total = quality×0.4 + consistency×0.3 + speed×0.2 + volume×0.1`

### Scores go negative — intentional

A single `immediate_interrupt` rejection costs `15 × 4 = −60` quality points. We considered a floor of 0, but this would obscure chronic underperformers (an employee with repeated rejections would appear "neutral" rather than clearly negative). Negative scores are a deliberate signal to the authority that intervention is needed.

### Quality only degrades

There are no positive quality events. Quality starts at 100 and only loses points. This matches the accountability model: doing your assigned job correctly is the baseline expectation, not a bonus.

### Speed uses per-ticket deadlines, averaged

Each ticket is scored independently against its severity deadline (2h / 8h / 48h), then scores are averaged across all submitted tickets in the period. Alternative: use the single worst ticket. We rejected this because one edge case (an emergency that took slightly longer) would unfairly collapse the entire speed score. The average is more representative of a period's overall performance.

### Scoring engine is a pure function

`computeScore(ScoringInput): ScoreBreakdown` takes `TicketHistory[]` (pre-fetched by `scoringService.ts`) and returns a score breakdown. Zero side effects. This enables:
- 47 unit tests that run in milliseconds with no DB connection
- Recomputation at any time with the same inputs
- Full separation between domain logic and persistence

### On-demand computation (not real-time)

Scores are recomputed on demand and stored as `ScoreRecord`. We chose this over recomputing on every ticket update because: scoring requires all tickets in a period (expensive full scan), the weekly reporting cadence makes on-demand sufficient, and `ScoreRecord` provides a historical snapshot at specific points in time.

---

## 4. How would you scale the recurring task generator if this managed 10,000 households?

The current implementation runs a single Node.js cron at 06:00 daily that loops all active templates sequentially. At 10k households with ~10 templates each = 100k iterations in one process. This breaks in three ways: memory pressure, cron timeout, and single-point-of-failure.

### Phase 1: Job queue (100–1,000 households)

Replace the cron loop with a message queue (BullMQ on Redis, or AWS SQS). The cron enqueues one job per household. Worker processes dequeue and call `generateDueInstances(householdId)` concurrently. Benefits: parallelism, automatic retry on failure, backpressure control.

### Phase 2: Partitioned schedule (1,000–10,000 households)

Instead of a single 06:00 burst, spread generation across the day by partitioning households (e.g., by household ID hash mod 24 = generation hour). Each partition runs independently. A single failed hour does not affect others.

### Phase 3: Event-driven scheduling (10,000+ households)

When a recurring template is created or its `frequency` changes, schedule its **next** generation time as a delayed job in the queue — no daily scan needed. The queue becomes the schedule. This eliminates the "scan all active templates" query entirely and scales to any number of households because generation is triggered by events, not time-based polling.

### What stays the same

The `generateDueInstances()` service function does not change — it is called by whatever scheduling mechanism is used. The `isTemplateDueToday()` idempotency check (look for an existing `RecurringInstance` with `generatedAt >= today`) prevents double-generation even if a job is retried.

---

## 5. What would you add first with another week of time?

**In priority order:**

### 1. Server-Sent Events for immediate_interrupt

The employee dashboard currently relies on React Query's poll interval to detect new `immediate_interrupt` tickets. A real SSE stream (`GET /api/sse/alerts`, authenticated) would push alerts to the employee's browser within milliseconds of creation. This is architecturally clean (no Socket.io, stateless HTTP/1.1 or HTTP/2), and the `InterruptAlert` full-screen overlay code is already built — it just needs a real-time trigger instead of polling.

### 2. Signed photo URLs in the frontend

`getPhotoSignedUrl()` is already implemented in `photoService.ts`. The frontend currently renders the raw MinIO URL. In production, photos should only be accessible via pre-signed S3 URLs (15-minute expiry) to prevent unauthorized access. This requires the frontend to request a signed URL before rendering each `<img>` — a one-day change with a significant security improvement.

### 3. Recurring template management UI

The authority dashboard has full ticket management but no UI for creating or editing recurring templates. Adding a "Templates" tab with a create/edit/deactivate form would allow household managers to configure recurring tasks without database access. The API endpoints (`POST/PATCH /api/recurring/templates`) are already built.

### 4. Penalty history timeline on employee dashboard

The `TicketAuditLog` contains all rejection events, but there is no UI showing employees their penalty history over time. A timeline view (rejection → which ticket → score impact) would make the scoring system transparent and give employees actionable feedback rather than just a final number.

### 5. PWA with push notifications

Adding a `manifest.json` and service worker would allow the app to be installed on employees' home screens and receive push notifications for `immediate_interrupt` tickets even when the browser is closed. Combined with SSE, this fully covers the "interrupt" surface for mobile-primary household workers.
