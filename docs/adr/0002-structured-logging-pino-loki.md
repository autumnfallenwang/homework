# 0002 — Structured logging with pino for Loki

- **Status:** accepted
- **Date:** 2026-05-31
- **Deciders:** project founder

## Context

The cluster aggregates container logs into **Loki** via an **Alloy** DaemonSet (managed by
`arch-infra`). Alloy tails each pod's stdout and attaches Kubernetes metadata (namespace, pod,
container, node) as Loki stream labels; it does **not** parse log bodies at ingest. JSON fields are
extracted at query time (`| json | level="error"`). So the only app-side requirement for clean
ingestion is: **emit one JSON object per line to stdout**, carrying the fields Grafana queries
expect.

During M01–M06 the `apps/api` code grew ~8 ad-hoc logging sites of the form
`console.info(JSON.stringify({ level, event, ts, ... }))`. These work, but the shape is inconsistent
with the sibling apps (`homenews`, `homecal`) — ours emitted `ts`/`duration_ms` and carried no
`service`/`version`, whereas the siblings emit `time`/`latency_ms` and a `service` label. Divergent
field names mean Loki/Grafana dashboards and alerts can't be shared across the three home apps.

The sibling apps both standardize on **pino** (`^10.x`): a single `log` export from
`apps/{api,web}/src/lib/logger.ts`, configured with `level` from `LOG_LEVEL`, a `base` of
`{ service, version }` (package scope stripped to a flat label like `homework-api`), and
`timestamp: pino.stdTimeFunctions.isoTime`. Raw JSON to stdout in all environments (no `pino-pretty`
in production).

## Decision

Adopt **pino** as the logging library for both `apps/api` and `apps/web`, matching the
`homenews`/`homecal` setup 1:1:

- One `log` instance exported from `apps/api/src/lib/logger.ts` (`service: "homework-api"`) and
  `apps/web/src/lib/logger.ts` (`service: "homework-web"`); `version` read from each `package.json`.
- `level: process.env.LOG_LEVEL ?? "info"`; ISO timestamps; JSON to stdout (no pretty-print in prod).
- Call convention: `log.info({ event, req_id, latency_ms, ... }, "message")`. Standard fields:
  pino-supplied `time`/`level`/`msg`/`service`/`version`, plus our `event` (categorical),
  `req_id` (per request), `*_ms` durations, `*_count` counts, and `err` (pino serializes Errors).
- Replace all hand-rolled `console.*(JSON.stringify(...))` logging in `apps/api` with `log.*`.

We considered keeping the hand-rolled `console.log(JSON.stringify(...))` approach (zero deps) — it
ingests into Loki fine — but rejected it for **cross-app consistency**: shared Grafana dashboards
and alert rules across the home apps depend on identical field names (`time`, `level`, `service`,
`latency_ms`).

## Consequences

**Positive:** logs match the sibling apps, so Grafana dashboards / Loki alert rules are portable
across `homework`/`homenews`/`homecal`; consistent structured fields (`service`, `version`,
`req_id`, `event`) make queries and request correlation reliable; runtime-tunable verbosity via
`LOG_LEVEL`. No app-side Loki wiring is needed beyond stdout JSON — Alloy auto-discovers pods.

**Trade-offs:** adds a `pino` runtime dependency to both apps; one extra module to keep in sync with
the siblings. M07's Helm chart must set `LOG_LEVEL: info` on the api + web Deployments (Alloy needs
no Deployment annotations).

**Open risks:** none significant. If we later want pretty local-dev logs, add `pino-pretty` as a
dev-only transport gated on `NODE_ENV !== "production"` — but the siblings don't, so we don't either.

## Notes

- Implemented as a standalone refactor committed ahead of M07 (deploy). M07 wires `LOG_LEVEL`.
- Alloy/Loki config lives in `arch-infra` (`platform/observability/`); apps only emit JSON to stdout.
- Related: [0001](./0001-initial-stack.md) (the stack decision that committed us to the
  Loki/Grafana/Alloy observability stack).
