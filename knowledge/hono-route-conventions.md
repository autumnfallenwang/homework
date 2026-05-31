---
name: hono-route-conventions
description: API route conventions for this repo — manual zod safeParse (no @hono/zod-validator), flat {error,details} envelope, *App Hono instances mounted under /api, no auth, Zod 3.
metadata:
  type: feedback
---

The HTTP API (`apps/api/src/routes/`) follows the homecal/homenews house style, settled in M04:

- **Validate with manual `schema.safeParse(body)`**, not `@hono/zod-validator` (no such dep). On
  failure return `c.json({ error: "Validation failed", details: parsed.error.issues }, 400)`.
- **Error envelope is flat**: `{ error: string, details?: unknown }`. 404 → `{ error: "Not found" }`.
- Each resource is a named `xxxApp = new Hono()` exported from its file and mounted in `app.ts`
  with `app.route("/api/...", xxxApp)`. Several sub-apps can share the `/api/children` prefix
  (children/grades/homework/fetch) — each owns distinct sub-paths.
- **No auth** (single-user LAN-only) — plain `new Hono()`, no `requireAuth`/session middleware.
- Schemas + inferred types live in `@homework/shared` (**Zod 3** syntax: `z.string().uuid()`,
  `z.string().datetime()` — NOT Zod-4 `z.iso.*`). IDs are uuid strings.
- Tests use Hono's built-in `app.request(path, init)` — no test-client lib. Validation-only 400
  cases run DB-free (they return before any query); happy-path/CRUD are gated
  `*.integration.test.ts` against live Postgres.

**Why:** keeps M06's web port a near-pure `ipc.ts → api.ts` transport swap and matches the sibling
repos so the deploy/observability story is identical.

**How to apply:** new endpoints (e.g. M05's `POST /digest/*`) mirror this exactly. The route's
singleton `db` import is safe at module load because `db/index.ts` connects lazily.
Related: [[schema-uuid-jsonb]], [[drizzle-sql-select-alias]].
