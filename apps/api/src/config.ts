/**
 * Centralized environment configuration.
 *
 * Dev reads `apps/api/.env` via `tsx --env-file`; prod relies on env vars
 * injected by the container runtime (Helm chart in M07). Same code, different
 * values at runtime.
 */
export const config = {
  /** Postgres connection string. Optional until M02 wires the DB client. */
  databaseUrl: process.env.DATABASE_URL,
  /** HTTP server port. */
  apiPort: Number(process.env.API_PORT ?? 3001),
  /** Log verbosity. */
  logLevel: process.env.LOG_LEVEL ?? "info",
  /** Origins allowed by CORS. */
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  /**
   * IANA timezone for the scheduler's fire times and the digest's "today".
   * Node reads `TZ` natively for local Date math; we also pass it to node-cron.
   * Defaults to America/New_York (set TZ on the M07 Deployment).
   */
  tz: process.env.TZ ?? "America/New_York",
  /**
   * Better Auth's signing secret (ADR 0004). Required: index.ts refuses to
   * start without it. Tests get a fixed one so they need no env.
   */
  betterAuthSecret:
    process.env.BETTER_AUTH_SECRET ??
    (process.env.NODE_ENV === "test" ? "test-only-better-auth-secret-0123456789" : undefined),
  /** This API's own public URL — Better Auth's baseURL. */
  betterAuthUrl: process.env.BETTER_AUTH_URL ?? `http://localhost:${process.env.API_PORT ?? 3001}`,
  /**
   * Cookie domain shared by the web and API hosts in the cluster
   * (`.arch.internal`): the UI is homework.arch.internal and the API is
   * homework-api.arch.internal, so a host-only cookie would never travel with
   * the UI's requests — "sign-in 200, then 401 on everything".
   * ⚠️ Must stay UNSET in local dev: a `.arch.internal` cookie is invalid on
   * localhost and the browser drops it silently.
   */
  cookieDomain: process.env.COOKIE_DOMAIN?.trim() || undefined,
} as const;
