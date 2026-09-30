---
name: 08-logging-house-standard
status: in-progress
created: 2026-09-29
---

# Milestone 08 — Logs are one JSON line per event

Bring homework's logs up to the home apps' current standard (homeparentcontrol ADR 0012, adopted as
[ADR 0003](../adr/0003-one-json-line-per-event.md)). The pipeline already worked — Alloy tails every
pod into Loki, retention is 30 days, the shared "Home apps — HTTP overview" dashboard lists
`homework` — but a live check on 2026-09-29 showed the lines themselves were hard to use: numeric
levels (100% `detected_level="unknown"`), `/health` at 98% of API volume, a pnpm/Corepack banner on
every start, a 2026-09-17 boot crash that reached Loki as ~60 raw lines no error query could find,
and a web app that logged nothing.

## Goal

`{namespace="homework"} | json | level="error"` finds every failure from both containers; each API
line is one JSON object with the level as a word; one request or one scheduled run can be pulled up
whole by `req_id` / `run_id`.

## Scope / deliverables

`apps/api`:
- `lib/logger.ts` — level words, `AsyncLocalStorage` context (`withLogContext`) via a **copying**
  mixin, `err` serializer that scrubs Drizzle bound params from message + stack, password-field
  redaction, `createLogger(stream)` for tests.
- `middleware/logger.ts` — level by status, `err` on 5xx, healthy `/health` skipped,
  `X-Request-Id` honoured + echoed, `req_id` context.
- `app.ts` — global `onError` → `{ error: "internal" }` 500 (HTTPException passes through).
- `index.ts` — crash handlers (one `fatal` line), boot work before listen (`server.boot_failed`),
  SIGTERM/SIGINT graceful shutdown.
- `services/scheduler.ts` — `runJob` gives each cron run `{ job, run_id }` and tracks it;
  `drainScheduler`; static messages, snake_case fields.
- `fetch/runner.ts` — `fetch.source.start` / `fetch.source.done` structured lines.

`apps/web`: `lib/web-error-log.ts` + `instrumentation.ts` (`onRequestError` → `web.request_error`),
`app/(shell)/error.tsx` showing the digest; unused pino logger + dep removed.

`deploy/`: `Dockerfile.api` runs `node --import tsx src/index.ts` (node is PID 1); migrate Job runs
`node node_modules/drizzle-kit/bin.cjs migrate`.

## Exit criteria

- [x] Unit tests read real JSON back: level words, house fields, context only inside its scope and
  no leak between lines, Error → `err` with stack, Drizzle params scrubbed (incl. cause chain),
  password fields redacted; request log (health skip, 2xx/4xx/5xx levels, onError swallows nothing,
  X-Request-Id echo/replace); scheduler (`runJob` context, failure line, drain + timeout); runner
  structured lines; web error line (one line, no query string/headers).
- [x] `pnpm lint` · `pnpm typecheck` · `pnpm test:fast` (shared 88 · api 87 · web 7) · `pnpm build`;
  full api suite on live Postgres 103 passed | 1 skipped (EMAIL_LIVE-gated).
- [x] Prod images under `deploy/compose.yaml`: node is PID 1; every API line is JSON with word
  levels; 5 `/health` probes → 0 lines; 404 → one `warn` line with the echoed `X-Request-Id`; a
  malformed id is replaced by a uuid.
- [x] DB stopped mid-run: `GET`/`PATCH /api/children` → `{"error":"internal"}` 500, exactly one
  `error` line each with `err.type=DrizzleQueryError` and `params: [redacted]`; the PATCH'd password
  appears nowhere in the logs.
- [x] `docker stop` → `server.shutdown` → `scheduler.stopped` → `server.stopped`, exit 0 in 52 ms.
  Boot with DB down → exactly one `fatal` `server.boot_failed` line per attempt (5 restarts, 5
  lines, 0 non-JSON), root cause `AggregateError [ECONNREFUSED]` in the stack.
- [x] A real cron tick: every line of the run carries the same `job`/`run_id`; manual
  `POST /children/:id/fetch` lines carry the request's `req_id`; `fetch.source.done` at `error`
  with `status:"failed"` + `err`.
- [x] Migrate Job command in the api image applies all migrations to an empty DB (exit 0).
- [x] Web standalone server with throwaway throwing routes: a render error and a route-handler error
  each write one `web.request_error` JSON line (query string dropped); the render digest matches the
  one in the page payload. (Next's own stderr stack remains — see ADR 0003 residue.)
- [ ] *(cluster)* Deployed via CI → arch-infra → Argo; migrate hook succeeds; pods Ready.
- [ ] *(cluster)* In Loki: the new pod's API lines are all JSON with `detected_level` set; `/health`
  gone; a 404 with a chosen `X-Request-Id` is one `warn` line; `req_id` / `job`+`run_id` present.

## Decisions

- **Adopt homeparentcontrol ADR 0012 verbatim** (recorded as ADR 0003) so one query/dashboard
  works across the home apps.
- **Scrub Drizzle params in the `err` serializer** — homework-specific (plaintext passwords, M02).
- **Mixin returns a copy** — pino mutates the mixin result; found by the e2e run, regression-tested.
- **Leave Next's banner and stderr stack alone** (as homeparentcontrol does); queries use
  `| json | __error__=""`.

## Progress

- 2026-09-29: implemented, unit-tested, and verified end to end on the prod images under compose
  (see exit criteria). The e2e run caught the mixin leak: `scheduler.fetch.done` carried the previous
  line's `status:"failed"`/`err`; fixed + regression test + image rebuilt and re-verified.

## References

- [ADR 0003](../adr/0003-one-json-line-per-event.md), amending [ADR 0002](../adr/0002-structured-logging-pino-loki.md)
- homeparentcontrol `97fd71f` (ADR 0012 implementation) and `ad1de2c` (post-deploy log check)
- arch-infra `ef7ad00` (30-day retention for `homework`), `83f2810` (Home apps dashboards)
