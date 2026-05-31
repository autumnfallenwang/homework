// Grades / classes / status-history. Mounted at /api/children (alongside the
// children CRUD app). Ports getGradesForFetchRun (latest run), getClasses,
// getAllStatusHistory.

import { statusHistoryQuerySchema } from "@homework/shared";
import { Hono } from "hono";
import { db } from "../db/index.js";
import * as q from "../db/queries.js";

export const gradesApp = new Hono();

// Latest successful run's grades. Empty array (not 500) when there's no run yet.
gradesApp.get("/:id/grades", async (c) => {
  const id = c.req.param("id");
  const child = await q.getChild(db, id);
  if (!child) return c.json({ error: "Not found" }, 404);
  return c.json(await q.getLatestGrades(db, id));
});

gradesApp.get("/:id/classes", async (c) => {
  const id = c.req.param("id");
  const child = await q.getChild(db, id);
  if (!child) return c.json({ error: "Not found" }, 404);
  return c.json(await q.getClasses(db, id));
});

gradesApp.get("/:id/status-history", async (c) => {
  const parsed = statusHistoryQuerySchema.safeParse({ limit: c.req.query("limit") });
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  const id = c.req.param("id");
  const child = await q.getChild(db, id);
  if (!child) return c.json({ error: "Not found" }, 404);
  return c.json(await q.getAllStatusHistory(db, id, parsed.data.limit));
});
