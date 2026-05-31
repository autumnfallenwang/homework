---
name: logging-pino-loki
description: Both apps log structured JSON via pino from src/lib/logger.ts (service/version/time/level/msg + event/req_id/latency_ms). Alloy tails stdout into Loki — no app-side wiring beyond JSON-to-stdout. ADR 0002.
metadata:
  type: feedback
---

Logging is **pino → stdout JSON**, one `log` export per app from `apps/{api,web}/src/lib/logger.ts`:
```ts
export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service, version: pkg.version }, // service = pkg.name scope-stripped → "homework-api"/"homework-web"
  timestamp: pino.stdTimeFunctions.isoTime,
});
```
Call convention: **`log.info({ event, req_id, latency_ms, ... }, "message")`**. pino supplies
`time`/`level`/`msg`; `base` adds `service`/`version` to every line. Standard fields: `event`
(categorical, e.g. `http.request`, `scheduler.arm`, `fetch`), `req_id` (per request, set in
`middleware/logger.ts`), `*_ms` durations (use **`latency_ms`**, not `duration_ms`), `*_count`,
`err` (pino serializes Errors). Matches homenews/homecal so Grafana dashboards + Loki alerts port
across the home apps.

**Why no app-side Loki wiring:** an Alloy DaemonSet (in `arch-infra`) tails each pod's **stdout**
and labels by namespace/pod/container; Loki parses JSON at query time (`| json | level="error"`).
So the only requirement is "print JSON lines to stdout" — no Deployment annotations, no log shipping
in the app. M07's Helm just sets `LOG_LEVEL: info` env on the api + web Deployments.

**How to apply:** never `console.log`/`console.info(JSON.stringify(...))` in app code — import `log`
from `src/lib/logger.js` and use the `{ event, ... }, "msg"` form. Don't add `pino-pretty` to prod
(siblings don't). When adding a workspace app, give it the same `logger.ts`. Decision: ADR 0002
(`docs/adr/0002-structured-logging-pino-loki.md`). Related: [[scheduler-nodecron-slots]],
[[hono-route-conventions]].
