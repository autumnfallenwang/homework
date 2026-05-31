import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config.js";
import { db } from "./db/index.js";
import * as q from "./db/queries.js";
import { requestLogger } from "./middleware/logger.js";
import { appMetaApp } from "./routes/app-meta.js";
import { childrenApp } from "./routes/children.js";
import { childFetchApp, fetchRunsApp } from "./routes/fetch-runs.js";
import { gradesApp } from "./routes/grades.js";
import { homeworkApp } from "./routes/homework.js";
import { scraperApp } from "./routes/scraper.js";
import { settingsApp } from "./routes/settings.js";

/** Build the Hono app. */
export function createApp() {
  const app = new Hono();

  // Request logging (structured JSON logs with req_id)
  app.use("*", requestLogger);

  // CORS — allow the web frontend origin(s)
  app.use(
    "*",
    cors({
      origin: config.corsOrigins,
      credentials: true,
    }),
  );

  // Health check
  app.get("/health", (c) => c.json({ status: "ok" }));

  // Computed attention config (not under /settings/:key).
  app.get("/api/attention-config", async (c) => c.json(await q.getAttentionConfig(db)));

  // Resource routes. children / grades / homework / fetch all share the
  // /api/children prefix (each sub-app owns distinct sub-paths).
  app.route("/api/children", childrenApp);
  app.route("/api/children", gradesApp);
  app.route("/api/children", homeworkApp);
  app.route("/api/children", childFetchApp);
  app.route("/api/fetch-runs", fetchRunsApp);
  app.route("/api/settings", settingsApp);
  app.route("/api/scraper", scraperApp);
  app.route("/api/app", appMetaApp);

  return app;
}
