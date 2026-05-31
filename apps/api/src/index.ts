import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { db } from "./db/index.js";
import { seedSettings } from "./db/seed-settings.js";
import { log } from "./lib/logger.js";
import { startScheduler } from "./services/scheduler.js";

if (!process.env.DATABASE_URL) {
  log.error({ event: "config.error" }, "DATABASE_URL is required");
  process.exit(1);
}

const app = createApp();

serve({ fetch: app.fetch, port: config.apiPort }, async (info) => {
  log.info({ event: "server.start", port: info.port }, "api server listening");
  // Ensure default settings exist on boot (idempotent).
  await seedSettings(db);
  // Arm the fetch + notify schedulers (skip under test so cron doesn't fire).
  if (process.env.NODE_ENV !== "test") {
    await startScheduler(db);
  }
});
