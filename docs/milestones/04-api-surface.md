---
name: 04-api-surface
status: todo
created: 2026-05-30
---

# Milestone 04 — HTTP API surface

Expose the full IPC contract the desktop frontend relied on as Hono REST routes, validated by shared Zod schemas. This is the contract M06 (web) consumes. Also moves the **attention engine** (pure domain logic) into `packages/shared` so both API and web use one implementation.

## Goal

Every read/write the old `src/lib/ipc.ts` exposed is reachable over HTTP with typed request/response validation. A frontend could drive the entire app (children CRUD, grades, homework, settings, manual fetch) through these endpoints alone.

## Scope / deliverables

`packages/shared/src/` — Zod schemas + inferred types for every entity (the shapes the explore surfaced): `ChildRecord`, `GradeRecord`, `AssignmentRecord`, `ClassRecord`, `StatusHistoryEntry`, `ClassDetails`/`Standard`/`Assignment`, `FetchRunRecord`, `HomeworkRecord`, `AttentionConfig`, `SendEmailArgs`. Plus the **attention engine** moved here (pure, no platform deps): `classifyAssignment`, `computeStandardAttention`, `computeClassAttention`, `computeChildAttention`. Also `homework-date.ts`, `trend.ts` helpers.

`apps/api/src/routes/` — mounted under `/api` in `app.ts`:

- **children.ts** — `POST /children` (addChild), `GET /children`, `GET /children/:id`, `PATCH /children/:id` (identity / password / homeworkUrl), `DELETE /children/:id`, `GET /children/:id/password`
- **grades.ts** — `GET /children/:id/grades` (latest successful run), `GET /children/:id/classes`, `GET /children/:id/status-history?limit=5`, `GET /fetch-runs/:id/standards?class=` (ClassDetails from raw_payloads)
- **homework.ts** — `GET /children/:id/homework?date=YYYY-MM-DD`, `GET /children/:id/homework/months`, `GET /children/:id/homework?month=YYYY-MM`
- **fetch-runs.ts** — `GET /children/:id/fetch-runs?latest=&successful=&source=`, `POST /children/:id/fetch` (trigger `runFetch` from M03), `GET /children/:id/fetch-runs`
- **settings.ts** — `GET /settings/:key`, `PUT /settings/:key`, `GET /attention-config` (computed)
- **scraper.ts** — `POST /scraper/login` (validate credentials), `POST /scraper/validate-homework-url`
- **app.ts route** — `POST /app/reset` (resetAllAppData), `GET /app/version`

## Exit criteria

- [ ] Every endpoint validates input with a shared Zod schema; malformed input → 400 with a typed error
- [ ] Response bodies match the shared types exactly (web can import them)
- [ ] Route-level tests (Hono test client) cover happy path + validation failure for each resource
- [ ] Attention engine moved to `packages/shared`, imported by the API; its existing unit tests ported and green
- [ ] `GET /children/:id/grades` with no successful run returns an empty/typed result, not a 500
- [ ] `POST /children/:id/fetch` triggers a real fetch_run and returns its id/status

## Decisions (locked)

- **No auth** — single-user LAN-only. No Better Auth, no session middleware (unlike homecal). CORS open to the web origin.
- **Attention engine lives in `packages/shared`** (not the API) so the web port can compute attention client-side exactly as the desktop app did — keeps M06 a near-pure transport swap.
- **REST shape** mirrors the homecal/homenews route conventions (resource files, `app.route()` mounting, `requestLog` + `req_id`).

## Open questions

- **Where does attention get computed — client or server?** The desktop app computed it client-side from `getAllClassDetails`. Two options: (a) keep it client-side in the web app (engine in shared, web imports it) — true 1:1; (b) add a server endpoint `GET /children/:id/attention` that runs the engine API-side. **Recommend (a)** for a faithful port + less API surface; revisit if the web bundle gets heavy. *(Plan assumes (a).)*
- **`POST /children/:id/fetch` sync vs async:** return after the fetch completes (simple, may take 3–10s/child) or return immediately + poll fetch-run status? Recommend **synchronous** for the port (matches "Fetch now" UX); the scheduler in M05 handles background runs.

## References

- Full IPC contract: surfaced from `teacherease-parent-companion/src/lib/ipc.ts` (every function = an endpoint)
- Attention engine: `src/lib/core/attention-engine.ts`, `homework-date.ts`, `trend.ts`
- Route blueprint: `homecal/apps/api/src/routes/`, `homenews/apps/api/src/routes/`
- Shared schema pattern: `homecal/packages/shared/src/index.ts`
- Depends on: M02 (schema), M03 (`runFetch`)
