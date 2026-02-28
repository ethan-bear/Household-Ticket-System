# LEARNING.md
## Architecture Decisions, Tradeoffs, Challenges & Reflections

---

## Stack Overview & Rationale

### Monorepo — pnpm Workspaces
Three packages: `apps/api`, `apps/web`, `packages/domain`. The domain package is pure TypeScript with zero framework dependencies — it exports the state machine, scoring engine, and repeat-issue detector. This enforces a hard boundary between business logic and infrastructure. Any framework can call it; none can corrupt it.

**Tradeoff:** pnpm monorepos require careful version pinning across environments. We hit multiple deployment failures because `npm install -g pnpm` installs the latest major version, and pnpm v10 has a `URLSearchParams` bug (`ERR_INVALID_THIS`) on certain Node.js versions used by Vercel and Railway. **Solution:** switch to `npx pnpm@8` in all build commands, which is self-contained and bypasses the global install + corepack conflict entirely.

---

### Backend — Express + TypeScript (not Next.js / Fastify)
Express is explicit and low-magic. For a system with strict RBAC middleware chains and an audit log on every mutation, it's easier to reason about request flow than with framework conventions. Fastify would also work but Express has broader ecosystem familiarity.

**Thin routes pattern:** routes validate input with Zod and delegate to services. No business logic in route handlers. Services orchestrate DB calls and domain functions. Domain functions are pure.

---

### Database — PostgreSQL 16 + Prisma ORM
PostgreSQL was chosen for native array columns (`Role[]` on `RecurringTemplate.assignedRoles`) and strong relational integrity. A `Json` field or join table would have worked but a native Postgres array is the cleaner model — Prisma handles it transparently.

Prisma was chosen over raw SQL for its type-safe query builder and migration system. **Key lesson:** migration files must be committed to the repo. If `.gitignore` excludes `prisma/migrations/`, `prisma migrate deploy` in production finds nothing and exits without error — silently leaving the schema unapplied.

---

### Auth — JWT + `RevokedToken` DB Table (no Redis)
JWT is stored in an **httpOnly cookie** (not localStorage) to protect against XSS. On logout, the token's `jti` claim is written to `RevokedToken`. Every authenticated request checks this table.

**No Redis:** Redis adds infrastructure complexity and cost for a small household system. A Postgres table with a daily cleanup cron is sufficient.

**Critical cross-origin issue:** when the frontend (Vercel) and API (Railway) are on different domains, cookies with `SameSite=Lax` are blocked by browsers on cross-origin requests. Every authenticated API call returned 401, which triggered the axios interceptor to clear localStorage and redirect to `/login` — causing the "flicker then logout" bug. **Fix:** `SameSite=None; Secure` in production.

---

### File Storage — Cloudinary (originally S3/MinIO)
Initially designed for AWS S3 / Cloudflare R2 / MinIO (Docker locally). Switched to Cloudinary on user request. Cloudinary's free tier is sufficient, the SDK is simpler (no presigned URLs, no bucket config), and URLs are public CDN links by default. The `s3Key` field in `TicketPhoto` now stores the Cloudinary `public_id` — the field name is a minor inaccuracy but schema migrations have a cost, so it was left as-is.

---

### Frontend — React + Vite (not Next.js)
This is a pure SPA — no server-side rendering needed. Vite gives fast HMR in development. `@tanstack/react-query` handles server state (caching, invalidation, loading states). `react-i18next` with `LanguageDetector` handles EN/ES switching with localStorage persistence.

**SPA routing on Vercel:** Vercel serves `index.html` for all routes via the `rewrites` rule in `vercel.json`. Without this, direct navigation to `/report` returns a 404.

---

### Real-time — SSE (not Socket.io)
`immediate_interrupt` tickets trigger a full-screen overlay on the employee dashboard. SSE (Server-Sent Events) is unidirectional server→client, which is all we need. Socket.io is bidirectional and adds a dependency. Per the spec: no Socket.io.

---

### Deployment — Railway (API) + Vercel (Frontend)

**Railway** runs the Express API and a managed PostgreSQL instance. The `railway.json` `startCommand` runs `prisma migrate deploy` before starting the server — this ensures schema is always up to date on deploy without a manual step.

**Vercel** hosts the React SPA. `VITE_API_URL` must be set in Vercel environment variables and must include the full `https://` prefix — without it, axios treats the value as a relative path and prepends the Vercel domain.

**Watch paths on Railway:** by default Railway only watched `apps/api/**`. Changes to `package.json` or `railway.json` at the repo root did not trigger redeploys. Setting watch path to `**` fixes this.

---

## Challenges & Lessons Learned

| Challenge | Root Cause | Fix |
|---|---|---|
| pnpm `ERR_INVALID_THIS` on Vercel/Railway | pnpm v10 bug with Node.js `URLSearchParams` | Use `npx pnpm@8` in build commands |
| `packageManager` field conflicts with build | Corepack intercepts `pnpm` command, overrides global install | Remove `packageManager` field; let npx handle it |
| Seed data duplicating on every restart | Templates and tickets used `create` not `upsert` | Added `count()` guard — skip if already seeded |
| Login succeeds then immediately logs out | `SameSite=Lax` blocks cross-origin cookies | Changed to `SameSite=None; Secure` in production |
| `VITE_API_URL` treated as relative path | Missing `https://` prefix in Vercel env var | Add protocol to env var value |
| Prisma migrations not found in production | `prisma/migrations/` was in `.gitignore` | Removed from `.gitignore`, committed migration files |
| `bcryptjs` not available at seed runtime | Listed as `devDependency`, excluded in production | Moved to `dependencies` |
| `tsx` not available at seed runtime | Same as above | Moved to `dependencies` |
| API env vars missing on Railway | Postgres plugin not linked to API service | Linked plugin via Railway Variables tab |
| Railway not auto-deploying on push | Watch paths set to `apps/api/**` only | Changed to `**` |
| dotenv not finding `.env` in monorepo | CWD when `tsx` runs from `apps/api` is not repo root | Copied `.env` to `apps/api/.env` |

---

## Scoring Model Reflections

The 40/30/20/10 weighting (Quality → Consistency → Speed → Volume) encodes a clear value hierarchy: doing work well matters more than doing it fast, and doing it reliably matters more than doing a lot of it. The pure-function design of `scoringEngine.ts` means it can be tested exhaustively without a database or server running — 47 unit tests validate edge cases including negative scores, missing deadlines, and zero-skip bonuses.

---

## What Would Change at Larger Scale

- **Redis** for token revocation (DB lookup on every request doesn't scale to thousands of concurrent users)
- **Job queue** (BullMQ) instead of node-cron for recurring task generation — cron is unreliable across multiple server instances
- **Signed Cloudinary URLs** for private photos instead of public CDN links
- **Pagination** on ticket list endpoints — currently returns all tickets
- **Separate read models** for reports instead of ad-hoc aggregation queries
