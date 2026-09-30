import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { closeDb, db } from "./db/index.js";
import { seedSettings } from "./db/seed-settings.js";
import { log } from "./lib/logger.js";
import { drainScheduler, startScheduler } from "./services/scheduler.js";

// ★ A crash is one JSON line at `fatal`, not a stack printed across dozens of
// Loki entries (2026-09-17: a boot-time DB error became ~60 raw lines that no
// `level="error"` query could find). Exit either way: state after an uncaught
// error is unknown, and k8s restarts the pod.
process.on("uncaughtException", (err) => {
  log.fatal({ event: "process.crash", kind: "uncaughtException", err }, "process crashed");
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  log.fatal({ event: "process.crash", kind: "unhandledRejection", err }, "process crashed");
  process.exit(1);
});

if (!config.databaseUrl) {
  log.fatal({ event: "config.error" }, "DATABASE_URL is required");
  process.exit(1);
}
// Sessions are signed with it (ADR 0004). Without it Better Auth would fall
// back to a default secret — refuse to start instead.
if (!config.betterAuthSecret) {
  log.fatal({ event: "config.error" }, "BETTER_AUTH_SECRET is required");
  process.exit(1);
}

// Boot work runs before the port opens, so a DB that is not reachable yet (a
// node reboot races the db pod's DNS) is one `server.boot_failed` line and a
// restart — never a half-started API with no scheduler.
try {
  // Ensure default settings exist (idempotent).
  await seedSettings(db);
  // Arm the fetch + notify schedulers (skip under test so cron doesn't fire).
  if (process.env.NODE_ENV !== "test") {
    await startScheduler(db);
  }
} catch (err) {
  log.fatal({ event: "server.boot_failed", err }, "boot failed");
  process.exit(1);
}

const app = createApp();

const server = serve({ fetch: app.fetch, port: config.apiPort }, (info) => {
  log.info({ event: "server.start", port: info.port }, "api server listening");
});

/**
 * Graceful stop. k8s sends SIGTERM and waits 30 s: stop taking requests, let
 * an in-flight fetch/notify run finish, close the DB pool, then exit.
 * ⚠️ Only reachable because the container runs `node` directly — under
 * `pnpm … start`, pnpm was PID 1 and the signal never arrived here.
 */
let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info({ event: "server.shutdown", signal }, "shutting down");
  setTimeout(() => process.exit(0), 20_000).unref();
  server.close();
  await drainScheduler(15_000);
  await closeDb();
  log.info({ event: "server.stopped" }, "shut down cleanly");
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
