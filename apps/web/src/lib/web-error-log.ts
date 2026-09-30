import pkg from "../../package.json";

/**
 * One server-side error in the web app, as ONE JSON line in the house shape —
 * the same fields the API writes, so `{namespace="homework"} | json |
 * level="error"` finds both containers' failures (docs/adr/0003).
 *
 * ⚠️ Why this exists: Next prints a failed render as a multi-line stack, and
 * Loki stores each line separately — unsearchable and unalertable.
 *
 * Dependency-free on purpose: `instrumentation.ts` is also compiled for the
 * edge runtime, where pino cannot load. Headers are never logged, and the path
 * drops its query string, so nothing a request carries reaches Loki.
 */
export function webErrorLine(
  error: unknown,
  request: { path: string; method: string },
  context: { routePath: string; routeType: string },
  now: Date = new Date(),
): string {
  const err = error instanceof Error ? error : new Error(String(error));
  const digest = (error as { digest?: unknown } | null)?.digest;
  return JSON.stringify({
    level: "error",
    time: now.toISOString(),
    service: "homework-web",
    version: pkg.version,
    event: "web.request_error",
    method: request.method,
    path: request.path.split("?")[0],
    route: context.routePath,
    route_type: context.routeType,
    // Shown on the error page, so a screenshot finds this exact line.
    ...(typeof digest === "string" ? { digest } : {}),
    err: { type: err.name, message: err.message, stack: err.stack },
    msg: "request failed",
  });
}
