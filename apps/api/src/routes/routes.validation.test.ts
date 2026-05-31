// Fast route tests — request validation only, no DB. Each case returns before
// any query runs, so these pass without DATABASE_URL (kept out of *.integration).

import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

const app = createApp();

function postJson(path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("request validation (400, no DB)", () => {
  it("health check still works", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  it("rejects addChild with missing required fields", async () => {
    const res = await postJson("/api/children", { displayName: "" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details: unknown[] };
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.details)).toBe(true);
  });

  it("rejects PATCH child with an empty body", async () => {
    const res = await app.request("/api/children/00000000-0000-0000-0000-000000000000", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("rejects settings PUT without a value", async () => {
    const res = await app.request("/api/settings/foo", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("rejects scraper login without credentials", async () => {
    const res = await postJson("/api/scraper/login", { baseUrl: "" });
    expect(res.status).toBe(400);
  });

  it("rejects homework with a malformed date", async () => {
    const res = await app.request(
      "/api/children/00000000-0000-0000-0000-000000000000/homework?date=nope",
    );
    expect(res.status).toBe(400);
  });
});
