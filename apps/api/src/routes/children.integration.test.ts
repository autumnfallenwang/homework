// Route integration tests — gated on DATABASE_URL, hit the live Postgres the
// routes' singleton db points at. Drives the API end-to-end with app.request.

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { closeDb, db } from "../db/index.js";
import { children, fetchRuns } from "../db/schema.js";
import { seedSettings } from "../db/seed-settings.js";

const url = process.env.DATABASE_URL;
const app = createApp();

function postJson(path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_CHILD = {
  displayName: "Test Kid",
  baseUrl: "https://x.example.com",
  username: "u@e.com",
  password: "secret",
};

describe.skipIf(!url)("children routes (live DB)", () => {
  beforeEach(async () => {
    await db.delete(children); // cascade clears downstream rows
    await seedSettings(db);
  });

  afterAll(async () => {
    await db.delete(children);
    await closeDb();
  });

  it("creates, lists, reads, patches, and deletes a child", async () => {
    const created = await postJson("/api/children", VALID_CHILD);
    expect(created.status).toBe(201);
    const child = (await created.json()) as { id: string; displayName: string };
    expect(child.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(child.displayName).toBe("Test Kid");

    const list = await app.request("/api/children");
    expect(list.status).toBe(200);
    expect((await list.json()) as unknown[]).toHaveLength(1);

    const read = await app.request(`/api/children/${child.id}`);
    expect(read.status).toBe(200);

    const patched = await app.request(`/api/children/${child.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Renamed" }),
    });
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { displayName: string }).displayName).toBe("Renamed");

    const pw = await app.request(`/api/children/${child.id}/password`);
    expect(((await pw.json()) as { password: string }).password).toBe("secret");

    const del = await app.request(`/api/children/${child.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);

    const after = await app.request("/api/children");
    expect((await after.json()) as unknown[]).toHaveLength(0);
  });

  it("returns 404 for an unknown child", async () => {
    const res = await app.request("/api/children/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("returns an empty grades list (not 500) when there is no successful run", async () => {
    const created = await postJson("/api/children", VALID_CHILD);
    const child = (await created.json()) as { id: string };
    const res = await app.request(`/api/children/${child.id}/grades`);
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown[]).toEqual([]);
  });

  it("POST /:id/fetch triggers a real fetch_run and returns a summary", async () => {
    // baseUrl is an unresolvable .invalid host → the run fails fast (no network
    // dependency on a real portal) but a fetch_run row is still recorded.
    const created = await postJson("/api/children", {
      ...VALID_CHILD,
      baseUrl: "https://nonexistent.invalid",
    });
    const child = (await created.json()) as { id: string };

    const res = await postJson(`/api/children/${child.id}/fetch`, {});
    expect(res.status).toBe(200);
    const summary = (await res.json()) as { runs: unknown[] };
    expect(Array.isArray(summary.runs)).toBe(true);

    const runs = await db.select().from(fetchRuns).where(eq(fetchRuns.childId, child.id));
    expect(runs.length).toBeGreaterThanOrEqual(1);
  });

  it("GET/PUT a setting round-trips and computes attention-config", async () => {
    const put = await app.request("/api/settings/attention.forgivenessWeeks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "3" }),
    });
    expect(put.status).toBe(200);

    const get = await app.request("/api/settings/attention.forgivenessWeeks");
    expect(((await get.json()) as { value: string }).value).toBe("3");

    const cfg = await app.request("/api/attention-config");
    expect(((await cfg.json()) as { forgivenessWeeks: number }).forgivenessWeeks).toBe(3);
  });
});
