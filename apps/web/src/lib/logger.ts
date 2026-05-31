// Structured logger (pino) for server-side code in the web app (route handlers,
// server actions). Emits JSON to stdout for Loki, matching the api + sibling
// apps. See docs/adr/0002-structured-logging-pino-loki.md.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pino } from "pino";

const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { name: string; version: string };

// Strip the `@homework/` scope so Loki sees a flat label (`homework-web`).
const service = pkg.name.replace(/^@[^/]+\//, "homework-");

export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service, version: pkg.version },
  timestamp: pino.stdTimeFunctions.isoTime,
});
