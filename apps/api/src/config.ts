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
} as const;
