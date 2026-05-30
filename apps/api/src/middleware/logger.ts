import { randomUUID } from "node:crypto";
import type { Context, Next } from "hono";

/** Structured JSON request logging with a per-request id. */
export async function requestLogger(c: Context, next: Next) {
  const reqId = randomUUID();
  const start = Date.now();

  c.set("reqId", reqId);

  await next();

  const duration = Date.now() - start;
  console.info(
    JSON.stringify({
      level: "info",
      event: "http.request",
      req_id: reqId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration_ms: duration,
      ts: new Date().toISOString(),
    }),
  );
}
