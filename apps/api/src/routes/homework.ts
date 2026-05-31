// Homework. Mounted at /api/children. Ports getHomeworkForDay / getHomeworkMonths
// / getHomeworkByMonth. `?date=YYYY-MM-DD` returns one day; `?month=YYYY-MM`
// returns the month; `/homework/months` lists months with counts.

import { homeworkQuerySchema } from "@homework/shared";
import { Hono } from "hono";
import { db } from "../db/index.js";
import * as q from "../db/queries.js";

export const homeworkApp = new Hono();

// Register the more specific /months path first.
homeworkApp.get("/:id/homework/months", async (c) => {
  const id = c.req.param("id");
  const child = await q.getChild(db, id);
  if (!child) return c.json({ error: "Not found" }, 404);
  return c.json(await q.getHomeworkMonths(db, id));
});

homeworkApp.get("/:id/homework", async (c) => {
  const parsed = homeworkQuerySchema.safeParse({
    date: c.req.query("date"),
    month: c.req.query("month"),
  });
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  const id = c.req.param("id");
  const child = await q.getChild(db, id);
  if (!child) return c.json({ error: "Not found" }, 404);

  const { date, month } = parsed.data;
  if (date) return c.json(await q.getHomeworkForDay(db, id, date));
  if (month) return c.json(await q.getHomeworkByMonth(db, id, month));
  return c.json({ error: "Provide a date or month query param" }, 400);
});
