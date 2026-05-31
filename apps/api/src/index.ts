import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { db } from "./db/index.js";
import { seedSettings } from "./db/seed-settings.js";
import { startScheduler } from "./services/scheduler.js";

if (!process.env.DATABASE_URL) {
  console.error(
    JSON.stringify({ level: "error", event: "config.error", msg: "DATABASE_URL is required" }),
  );
  process.exit(1);
}

const app = createApp();

serve({ fetch: app.fetch, port: config.apiPort }, async (info) => {
  console.info(
    JSON.stringify({
      level: "info",
      event: "server.start",
      port: info.port,
      ts: new Date().toISOString(),
    }),
  );
  // Ensure default settings exist on boot (idempotent).
  await seedSettings(db);
  // Arm the fetch + notify schedulers (skip under test so cron doesn't fire).
  if (process.env.NODE_ENV !== "test") {
    await startScheduler(db);
  }
});
