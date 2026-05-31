// Fetch runs + manual fetch trigger + class-detail (standards) reads.
//
// childFetchApp is mounted at /api/children:
//   GET  /:id/fetch-runs   — list runs (filterable)
//   POST /:id/fetch        — trigger runFetch synchronously, return the summary
// fetchRunsApp is mounted at /api/fetch-runs:
//   GET  /:id/standards?class=  — ClassDetails from the run's raw payload

import { fetchRunsQuerySchema } from "@homework/shared";
import { Hono } from "hono";
import { db } from "../db/index.js";
import * as q from "../db/queries.js";
import { runFetch } from "../fetch/run-fetch.js";

export const childFetchApp = new Hono();

childFetchApp.get("/:id/fetch-runs", async (c) => {
  const parsed = fetchRunsQuerySchema.safeParse({
    latest: c.req.query("latest"),
    successful: c.req.query("successful"),
    source: c.req.query("source"),
    limit: c.req.query("limit"),
  });
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  const id = c.req.param("id");
  const child = await q.getChild(db, id);
  if (!child) return c.json({ error: "Not found" }, 404);
  return c.json(await q.getFetchRunsForChild(db, id, parsed.data));
});

// Synchronous "Fetch now": runs all applicable sources and returns the summary.
childFetchApp.post("/:id/fetch", async (c) => {
  const id = c.req.param("id");
  const child = await q.getChild(db, id);
  if (!child) return c.json({ error: "Not found" }, 404);
  const summary = await runFetch(id);
  return c.json(summary);
});

export const fetchRunsApp = new Hono();

fetchRunsApp.get("/:id/standards", async (c) => {
  const fetchRunId = c.req.param("id");
  const className = c.req.query("class");
  if (className) {
    const detail = await q.getClassDetail(db, fetchRunId, className);
    if (!detail) return c.json({ error: "Not found" }, 404);
    return c.json(detail);
  }
  return c.json(await q.getAllClassDetails(db, fetchRunId));
});

// Per-run grades + assignments (the web's recent-activity diff reads two runs).
fetchRunsApp.get("/:id/grades", async (c) => {
  return c.json(await q.getGradesForFetchRun(db, c.req.param("id")));
});

fetchRunsApp.get("/:id/assignments", async (c) => {
  return c.json(await q.getAssignmentsForFetchRun(db, c.req.param("id")));
});
