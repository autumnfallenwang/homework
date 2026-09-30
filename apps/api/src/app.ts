import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { auth } from "./auth.js";
import { config } from "./config.js";
import { db } from "./db/index.js";
import * as q from "./db/queries.js";
import {
  type AuthVariables,
  authorize,
  betterAuthSession,
  publicRateLimiter,
  type ResolveSession,
  signupGate,
} from "./middleware/auth.js";
import { requestLogger } from "./middleware/logger.js";
import { appMetaApp } from "./routes/app-meta.js";
import { childrenApp } from "./routes/children.js";
import { digestApp } from "./routes/digest.js";
import { childFetchApp, fetchRunsApp } from "./routes/fetch-runs.js";
import { gradesApp } from "./routes/grades.js";
import { homeworkApp } from "./routes/homework.js";
import { childLoginsApp } from "./routes/logins.js";
import { childAreaApp, meApp } from "./routes/me.js";
import { publicApp } from "./routes/public.js";
import { scraperApp } from "./routes/scraper.js";
import { settingsApp } from "./routes/settings.js";

export interface AppOptions {
  /** How a request becomes a user. Route tests inject a fake so they need no DB. */
  resolveSession?: ResolveSession;
  /** Per-IP limits on sign-in and /api/public/*. Off under tests (shared in-memory store). */
  rateLimit?: boolean;
}

/** Build the Hono app. */
export function createApp(options: AppOptions = {}) {
  const resolveSession = options.resolveSession ?? betterAuthSession;
  const rateLimit = options.rateLimit ?? process.env.NODE_ENV !== "test";
  const app = new Hono<{ Variables: AuthVariables }>();

  // One `http.request` line per request; `req_id` on every line inside it.
  app.use("*", requestLogger);

  // The last resort for a THROWN error nothing else handled: the house's flat
  // `{ error }` and a 500. It does not log — the request line above already
  // carries `err` at `error` level, as one JSON line. Without it, Hono's
  // default printed a multi-line stack that Loki split into one entry per line
  // (ADR 0003). Routes hand-map their 400/404s as RETURNED responses, so this
  // swallows nothing; an HTTPException keeps its own response.
  app.onError((err, c) =>
    err instanceof HTTPException ? err.getResponse() : c.json({ error: "internal" }, 500),
  );

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

  // ── Logins (ADR 0004) ──────────────────────────────────────────────────
  if (rateLimit) {
    app.use("/api/auth/sign-in/*", publicRateLimiter(10));
    app.use("/api/public/*", publicRateLimiter(30));
  }
  // Must precede the Better Auth handler: it gates one of its routes.
  app.use("/api/auth/*", signupGate);
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
  // Everything under /api/* past this point needs a session with the right role.
  app.use("/api/*", authorize(resolveSession));
  app.route("/api/public", publicApp);
  app.route("/api/me", meApp);
  app.route("/api/child", childAreaApp);

  // Computed attention config (not under /settings/:key).
  app.get("/api/attention-config", async (c) => c.json(await q.getAttentionConfig(db)));

  // Resource routes. children / grades / homework / fetch all share the
  // /api/children prefix (each sub-app owns distinct sub-paths).
  app.route("/api/children", childrenApp);
  app.route("/api/children", gradesApp);
  app.route("/api/children", homeworkApp);
  app.route("/api/children", childFetchApp);
  app.route("/api/children", childLoginsApp);
  app.route("/api/fetch-runs", fetchRunsApp);
  app.route("/api/settings", settingsApp);
  app.route("/api/scraper", scraperApp);
  app.route("/api/app", appMetaApp);
  app.route("/api/digest", digestApp);

  return app;
}
