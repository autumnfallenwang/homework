import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config.js";
import { requestLogger } from "./middleware/logger.js";

/** Build the Hono app. Routes are mounted here as later milestones add them. */
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

  return app;
}
