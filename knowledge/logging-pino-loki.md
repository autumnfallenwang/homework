---
name: logging-pino-loki
description: One JSON line per event (ADR 0003 = homeparentcontrol ADR 0012) — pino level WORDS, static msg + fields, req_id/job+run_id via withLogContext, err serializer scrubs Drizzle params; Alloy tails stdout into Loki; query cheat-sheet + post-deploy check.
metadata:
  type: feedback
---

Every log line is **one JSON object on stdout** in the house shape shared by all home apps:
`level` (a WORD — `info`/`warn`/`error`/`fatal`), `time`, `service` (`homework-api` /
`homework-web`), `version`, `event`, a **static** `msg`, plus fields. Alloy tails stdout and labels
only `namespace`/`pod`/`container`/`node`; everything else is `| json` at query time. Retention 30d.

**API** — import from `src/lib/logger.js`:
```ts
log.info({ event: "fetch.source.done", child_id, status, duration_ms }, "fetch source finished");
log.error({ event: "scheduler.fetch.child_failed", child_id, err }, "child fetch failed");
withLogContext({ job: "fetch", run_id: randomUUID() }, () => work()); // every line inside gets them
```
- **Static `msg`** — anything that varies goes in a field, or it can't be counted/grouped/alerted.
- **snake_case fields**: `req_id`, `run_id`, `child_id`, `fetch_run_id`; `latency_ms` on
  `http.request`, `duration_ms` on runs; `*_count` for counts; errors always as `err` (the Error
  object — pino serializes type/message/stack on one line).
- `req_id` is automatic inside a request (middleware), `{ job, run_id }` inside a scheduler run
  (`runJob`). Don't pass them by hand.
- ⚠️ **Never put a secret in `msg`** — redaction is by path (`password`, `portalPassword`, `pass`).
  The `err` serializer scrubs `DrizzleQueryError`'s bound params from message + stack (they can be
  plaintext portal/SMTP passwords); keep that serializer if you touch the logger.
- ⚠️ The pino `mixin` must return a **copy** of the context (`{ ...context.getStore() }`): pino
  `Object.assign`s each line's fields into the mixin result, so returning the store leaks fields
  across lines. homeparentcontrol's logger still has this bug.
- Don't throw-and-log: an unhandled throw becomes `{ error: "internal" }` 500 via `onError` and the
  request line carries `err` at `error`. Hand-mapped 400/404s are returned, not thrown.

**Web** — no pino. Server errors go through `instrumentation.ts` → `web.request_error` (with the
`digest` the error page shows). Next's banner + `⨯` stderr stack are the only non-JSON lines left.

**Loki cheat-sheet** (Grafana → Explore, or `curl -G http://loki.arch.internal/loki/api/v1/query_range`):
- every failure, both containers: `{namespace="homework"} | json | __error__="" | level=~"error|fatal"`
- one request: `{namespace="homework"} | json | req_id="<id>"` (send `X-Request-Id: <id>` to pick it)
- one scheduled run: `{namespace="homework", container="api"} | json | run_id="<id>"`
- ⚠️ **`job` is `job_extracted` in Loki**: Alloy stamps every stream with a label
  `job="loki.source.kubernetes.pods"`, which wins over our JSON field, so `| json | job="fetch"`
  silently matches nothing. Use `| json | job_extracted="fetch"` (all home apps; verified 2026-09-30).
- fetch outcomes: `sum by (status) (count_over_time({namespace="homework", container="api"} | json | event="fetch.source.done" [1d]))`
- dashboard: Grafana → folder "Home apps" → "Home apps — HTTP overview", namespace `homework`.

**After every deploy — the log check** (2 min):
1. `curl -s -D - -o /dev/null -H "X-Request-Id: postdeploy-$(date +%s)" http://homework-api.arch.internal/api/nope`
   → header echoed; Loki `| json | req_id="<id>"` = exactly one line, `level="warn"`, `status=404`.
2. The new pod's lines are all JSON: `{namespace="homework", container="api"} !~ "^\\{"` over the
   deploy window returns **nothing**; startup shows `scheduler.arm` ×N → `scheduler.started` → `server.start`.

Decisions: [ADR 0002](../docs/adr/0002-structured-logging-pino-loki.md) (pino/Loki pipeline),
[ADR 0003](../docs/adr/0003-one-json-line-per-event.md) (line shape). Related:
[[scheduler-nodecron-slots]], [[hono-route-conventions]], [[deploy-helm-arch-infra]].
