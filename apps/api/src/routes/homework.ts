// Homework. Mounted at /api/children. Ports getHomeworkForDay / getHomeworkMonths
// / getHomeworkByMonth. `?date=YYYY-MM-DD` returns what was posted that day;
// `?due=YYYY-MM-DD` what is due that day, whenever posted; `?month=YYYY-MM` the
// month; `/homework/months` lists months with counts.

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
    due: c.req.query("due"),
  });
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  const id = c.req.param("id");
  const child = await q.getChild(db, id);
  if (!child) return c.json({ error: "Not found" }, 404);

  const { date, month, due } = parsed.data;
  if (date) return c.json(await q.getHomeworkForDay(db, id, date));
  if (due) return c.json(await q.getHomeworkDueOnDay(db, id, due));
  if (month) return c.json(await q.getHomeworkByMonth(db, id, month));
  return c.json({ error: "Provide a date, due or month query param" }, 400);
});
