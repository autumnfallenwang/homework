// Digest route integration tests — gated on DATABASE_URL. Hits the live DB the
// routes' singleton db points at.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { closeDb, db } from "../db/index.js";
import { children, settings } from "../db/schema.js";
import { seedSettings } from "../db/seed-settings.js";

const url = process.env.DATABASE_URL;
const app = createApp();

describe.skipIf(!url)("digest routes (live DB)", () => {
  beforeEach(async () => {
    await db.delete(children);
    await db.delete(settings);
    await seedSettings(db);
  });

  afterAll(async () => {
    await db.delete(children);
    await closeDb();
  });

  it("POST /api/digest/test returns 400 when SMTP is unconfigured", async () => {
    const res = await app.request("/api/digest/test", { method: "POST" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/SMTP/);
  });

  it("POST /api/digest/send returns sent:false when email disabled", async () => {
    const res = await app.request("/api/digest/send", { method: "POST" });
    expect(res.status).toBe(200);
    expect((await res.json()) as { sent: boolean }).toEqual({ sent: false });
  });
});
