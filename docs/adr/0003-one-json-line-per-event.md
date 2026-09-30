# 0003 — Logs are one JSON line per event (house standard)

- **Status:** accepted
- **Date:** 2026-09-29
- **Deciders:** project founder

## Context

[ADR 0002](./0002-structured-logging-pino-loki.md) put both apps on pino → stdout → Alloy → Loki,
matching `homenews`/`homecal`. On 2026-09-28 `homeparentcontrol` checked all five home apps' logs
in live Loki and found them arriving but hard to use, then fixed its own in
[homeparentcontrol ADR 0012](https://github.com/autumnfallenwang/homeparentcontrol/blob/main/docs/adr/0012-one-json-line-per-event.md).
The shared "Home apps — HTTP overview" Grafana dashboard (`arch-infra@83f2810`) is written against
that shape. A live check of homework's own stream on 2026-09-29 found every one of its problems:

- **Levels were numbers** (`"level":30`): all 11,732 lines/day were `detected_level="unknown"`, so
  Grafana's level colours and filters did nothing.
- **`/health` was 98% of the API's volume** (11,521 of 11,718 lines/day, from the k8s probes).
- **Non-JSON startup lines**: every API start printed ~5 lines of `pnpm … start` banner, including
  Corepack *downloading pnpm from npmjs.org* — a boot needed internet. pnpm was PID 1, so SIGTERM
  never reached the app.
- **Crashes bypassed the logger.** On 2026-09-17 the API booted before the db pod's DNS resolved;
  the seed query's `DrizzleQueryError` escaped as ~60 raw stack lines. A `level="error"` query over
  those 13 days returned **nothing**. The raw dump also printed the query's bound parameters.
- **No request/run context** on a handler's or scheduled job's own lines, and fetch outcomes were
  free-text messages (`fetch: failed source=… childId=… — …`) that could not be grouped.
- **The web app logged nothing** — `apps/web/src/lib/logger.ts` was never imported.

## Decision

Adopt homeparentcontrol ADR 0012 as-is. Every log line is **one JSON object in the house shape**
(`level, time, service, version, event, msg` + fields) with a **static `msg`**:

1. pino writes the level as a word (`formatters.level`).
2. `http.request` is logged at a level chosen by status (5xx `error`, 4xx `warn`); a 5xx carries
   `err` (stack included). A healthy `/health` is not logged. `X-Request-Id` is honoured when it
   looks like an id, and echoed.
3. `AsyncLocalStorage` puts `{ req_id }` on every line inside a request and `{ job, run_id }` on
   every line inside a scheduled fetch/notify run. Fetch outcomes are
   `fetch.source.done` lines with `source`/`child_id`/`fetch_run_id`/`status`/`duration_ms`/`err`.
4. A global `onError` answers only a *thrown* error nothing handled, returning the house's flat
   `{ error: "internal" }` 500, and logs nothing itself (the request line carries `err`). Routes'
   hand-mapped 400/404s are returned responses and never reach it.
5. Crashes (`uncaughtException`, `unhandledRejection`) and boot failures are one `fatal` line, then
   exit. SIGTERM logs `server.shutdown`, drains in-flight scheduler runs, closes the DB pool, exits.
6. The API and the migrate Job start with `node` directly, not `pnpm … start`.
7. The web app writes one `web.request_error` line per server error (Next's `onRequestError`), and
   the error page shows the `digest` that finds it. The unused web pino logger is removed — the
   error-line builder is dependency-free because `instrumentation.ts` also compiles for the edge
   runtime.

Two homework-specific additions, both found while implementing:

- **Query parameters are scrubbed from errors.** homework stores portal and SMTP passwords in
  plaintext (M02), and `DrizzleQueryError` writes its bound parameters into its *message*, hence
  its stack — so redacting the `params` path alone is not enough. A custom `err` serializer replaces
  `params: …` in message and stack (whole cause chain) with `[redacted]`; `password`/`pass`-shaped
  fields are redacted by path.
- **The pino mixin returns a copy of the context.** pino merges each line's fields *into* the
  mixin's return value, so returning the AsyncLocalStorage store itself leaked one line's
  `status`/`err` onto every later line of the same request or run. (homeparentcontrol's
  `mixin: () => context.getStore() ?? {}` has the same bug.)

## Consequences

**Positive:** `{namespace="homework"} | json | level="error"` finds every API failure, crash and
web server error; Grafana colours levels; the shared HTTP overview dashboard works unchanged; one
request or one scheduled run can be pulled up whole by `req_id` / `run_id`; the API stops cleanly
on SIGTERM (verified: 52 ms, exit 0) and boots without internet access; API log volume drops ~98%.

**Trade-offs:** unhandled 500s now return `{ "error": "internal" }` instead of Hono's plain-text
body (the web client already tolerates any error body). One more module-level mechanism
(AsyncLocalStorage) to understand.

**Known residue:**

- Next still prints its startup banner (6 lines per web start) and, for a server error, its own
  `⨯ Error…` stack to stderr next to our JSON line — the same as homeparentcontrol. Queries use
  `| json | __error__=""`, which skips them.
- The migrate Job's `drizzle-kit migrate` prints its own progress lines (a short-lived hook pod).
- Postgres logs stay plain text.

## Notes

- Amends [0002](./0002-structured-logging-pino-loki.md) (same pino/Loki pipeline; stricter line shape).
- Implemented in [milestone 08](../milestones/08-logging-house-standard.md).
- Loki retention for the `homework` namespace is 30 days (`arch-infra@ef7ad00`, 2026-09-20).
