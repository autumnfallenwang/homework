// Structured logger (pino). Emits one JSON object per line to stdout — the
// Alloy DaemonSet tails container stdout into Loki and labels by pod, so apps
// only need to print JSON with consistent fields. Matches the homenews/homecal
// setup 1:1 (see docs/adr/0002-structured-logging-pino-loki.md) so Grafana
// dashboards + Loki alerts are portable across the home apps.
//
// Convention: log.info({ event, req_id, latency_ms, ... }, "message").
// pino supplies time/level/msg; `base` adds service/version to every line.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pino } from "pino";

const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { name: string; version: string };

// Strip the `@homework/` scope so Loki sees a flat label (`homework-api`).
const service = pkg.name.replace(/^@[^/]+\//, "homework-");

export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service, version: pkg.version },
  timestamp: pino.stdTimeFunctions.isoTime,
});
