// App-level endpoints. Mounted at /api/app. Ports resetAllAppData + getAppVersion.

import { Hono } from "hono";
import { db } from "../db/index.js";
import * as q from "../db/queries.js";

export const appMetaApp = new Hono();

appMetaApp.post("/reset", async (c) => {
  await q.resetAllAppData(db);
  return c.json({ ok: true });
});

appMetaApp.get("/version", (c) => {
  return c.json({ version: q.getAppVersion() });
});
