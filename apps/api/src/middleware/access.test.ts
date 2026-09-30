// ★ The access matrix (ADR 0004), DB-free: EVERY route the real app registers
// is classified, then probed through `authorize` on a stub app — so no real
// handler runs (a parent-session probe of POST /api/app/reset against the real
// app would wipe whatever DATABASE_URL points at).

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { asChild, asNobody, asParent } from "../test/sessions.js";
import { authorize, publicRateLimiter, type ResolveSession, requiredRole } from "./auth.js";

const ID = "00000000-0000-4000-8000-000000000001";

/** Every concrete API route of the real app (not middleware, not Better Auth's own). */
const routes = createApp({ resolveSession: asNobody })
  .routes.filter((r) => r.method !== "ALL" && r.path.startsWith("/api/"))
  .filter((r) => !r.path.startsWith("/api/auth/"))
  .map((r) => ({ method: r.method, path: r.path.replace(/:[A-Za-z]+/g, ID) }));

function probe(resolveSession: ResolveSession) {
  const app = new Hono();
  app.use("/api/*", authorize(resolveSession));
  app.all("*", (c) => c.text("reached"));
  return (method: string, path: string) => app.request(path, { method });
}

const kind = (path: string) => (path.startsWith("/api/public/") ? "public" : requiredRole(path));

describe("the access matrix", () => {
  it("covers the whole API — every route that existed before is parent-only", () => {
    const parentOnly = routes.filter((r) => kind(r.path) === "parent").map((r) => r.path);
    expect(routes.length).toBeGreaterThan(30);
    for (const path of [
      `/api/children/${ID}/password`,
      "/api/settings/" + ID,
      "/api/app/reset",
      "/api/digest/send",
      `/api/children/${ID}/fetch`,
      `/api/children/${ID}/invites`,
    ]) {
      expect(parentOnly).toContain(path);
    }
  });

  it("★ no session → 401 on every non-public route; public routes stay open", async () => {
    const call = probe(asNobody);
    for (const r of routes) {
      const res = await call(r.method, r.path);
      expect([r.method, r.path, res.status]).toEqual([
        r.method,
        r.path,
        kind(r.path) === "public" ? 200 : 401,
      ]);
    }
  });

  it("★ a child → 403 on every parent route; reaches /api/me and /api/child/*", async () => {
    const call = probe(asChild());
    for (const r of routes) {
      const res = await call(r.method, r.path);
      expect([r.method, r.path, res.status]).toEqual([
        r.method,
        r.path,
        kind(r.path) === "parent" ? 403 : 200,
      ]);
    }
  });

  it("★ a parent → reaches every parent route and /api/me; 403 on /api/child/*", async () => {
    const call = probe(asParent);
    for (const r of routes) {
      const res = await call(r.method, r.path);
      expect([r.method, r.path, res.status]).toEqual([
        r.method,
        r.path,
        kind(r.path) === "child" ? 403 : 200,
      ]);
    }
  });

  it("a session lookup that throws is a 401, not a 500", async () => {
    const res = await probe(async () => {
      throw new Error("bad cookie");
    })("GET", "/api/children");
    expect(res.status).toBe(401);
  });

  it("/health and non-API paths are never gated", async () => {
    const call = probe(asNobody);
    expect((await call("GET", "/health")).status).toBe(200);
    expect((await call("GET", "/api/auth/get-session")).status).toBe(200);
  });
});

describe("publicRateLimiter", () => {
  it("answers 429 once one IP passes the limit in a minute", async () => {
    const app = new Hono();
    app.use("*", publicRateLimiter(3));
    app.get("*", (c) => c.text("ok"));
    const hit = () => app.request("/x", { headers: { "x-forwarded-for": "10.0.0.9" } });
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await hit()).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
    // A different client is not affected.
    const other = await app.request("/x", { headers: { "x-forwarded-for": "10.0.0.10" } });
    expect(other.status).toBe(200);
  });
});
