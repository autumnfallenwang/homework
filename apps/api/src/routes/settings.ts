// Settings KV. Mounted at /api/settings. GET/PUT a single key. (The computed
// /api/attention-config endpoint is registered directly on the app, since it is
// not under the /settings/:key namespace.)

import { settingValueSchema } from "@homework/shared";
import { Hono } from "hono";
import { db } from "../db/index.js";
import * as q from "../db/queries.js";

export const settingsApp = new Hono();

settingsApp.get("/:key", async (c) => {
  const key = c.req.param("key");
  const value = await q.getSetting(db, key);
  if (value === null) return c.json({ error: "Not found" }, 404);
  return c.json({ key, value });
});

settingsApp.put("/:key", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = settingValueSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  const key = c.req.param("key");
  await q.setSetting(db, key, parsed.data.value);
  return c.json({ key, value: parsed.data.value });
});
