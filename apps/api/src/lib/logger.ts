// Structured logger (pino) — the house contract, identical across the home apps
// so one Loki query works for all of them (docs/adr/0003, adopting
// homeparentcontrol ADR 0012):
//
//   log.info({ event, req_id, latency_ms, ... }, "static message")
//
// One JSON object per line on stdout; the Alloy DaemonSet tails it into Loki
// and labels by namespace/pod/container. The message is STATIC — anything that
// varies goes in a field, or the line cannot be counted, grouped or alerted on.

import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type DestinationStream, type LoggerOptions, pino, stdSerializers } from "pino";

const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { name: string; version: string };

// Strip the `@homework/` scope so Loki sees a flat label (`homework-api`).
const service = pkg.name.replace(/^@[^/]+\//, "homework-");

const REDACTED = "[redacted]";

/**
 * What every line inside one request or one scheduled run carries without
 * being told: `{ req_id }` or `{ job, run_id }`. Set by `withLogContext`, read
 * by the `mixin` below — so a fetch's own lines land next to the request or
 * cron run that started it.
 */
const context = new AsyncLocalStorage<Record<string, string>>();

export function withLogContext<T>(fields: Record<string, string>, fn: () => T): T {
  return context.run({ ...context.getStore(), ...fields }, fn);
}

/**
 * pino's standard `err` serializer, minus bound query parameters.
 *
 * ⚠️ DrizzleQueryError writes its parameters into the MESSAGE
 * (`Failed query: …\nparams: a,b,c`), so they also land in the stack — and
 * homework stores portal + SMTP passwords in plaintext (M02). A failed
 * `UPDATE children SET portal_password = $1` would otherwise put the password
 * into Loki for 30 days. Redacting the `params` path alone is not enough.
 */
function serializeErr(err: Error) {
  const out = stdSerializers.err(err);
  // Walk the cause chain: pino folds each cause's message + stack into ours.
  for (let e: unknown = err; e instanceof Error; e = e.cause) {
    const params = (e as { params?: unknown }).params;
    if (!Array.isArray(params) || params.length === 0) continue;
    const leaked = `\nparams: ${params}`;
    out.message = out.message.replaceAll(leaked, `\nparams: ${REDACTED}`);
    out.stack = out.stack?.replaceAll(leaked, `\nparams: ${REDACTED}`);
  }
  if ("params" in out) out.params = REDACTED;
  return out;
}

export const loggerOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  base: { service, version: pkg.version },
  timestamp: pino.stdTimeFunctions.isoTime,
  /**
   * ★ `"level":"info"`, not pino's default `"level":30`. Loki recognises the
   * word and sets `detected_level`, which Grafana's level colours and filters
   * use; with numbers every homework line was `detected_level="unknown"`
   * (checked 2026-09-29). Query with `| json | level="error"`.
   */
  formatters: { level: (label) => ({ level: label }) },
  // ⚠️ A COPY of the store: pino merges each line's fields INTO the mixin's
  // return value (`Object.assign(mixin, fields)`), so returning the store
  // itself let one line's `status`/`err` leak onto every later line of the
  // same request or run (caught in the M08 e2e run).
  mixin: () => ({ ...context.getStore() }),
  serializers: { err: serializeErr },
  /**
   * Credentials must never reach Loki. pino redacts by PATH, not by value: it
   * cannot censor a secret interpolated into a message string — so never put
   * one in a message, always in a field.
   */
  redact: {
    paths: ["password", "*.password", "portalPassword", "*.portalPassword", "pass", "*.pass"],
    censor: REDACTED,
  },
};

/** The same logger writing somewhere else — for tests that read the JSON back. */
export function createLogger(destination?: DestinationStream) {
  return destination ? pino(loggerOptions, destination) : pino(loggerOptions);
}

export const log = createLogger();
