// Settings → Grading (ADR 0014). Mounted at /api/grading, parent-only by path.
//   GET  /settings  the grading settings
//   PUT  /settings  save them (turning grading on stamps enabledAt)
//   GET  /models    llmgw's chat models, with whether each reads images

import { gradingSettingsSchema } from "@homework/shared";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { gradingModels, loadGradingSettings, saveGradingSettings } from "../services/grading.js";

export const gradingApp = new Hono();

gradingApp.get("/settings", async (c) => c.json(await loadGradingSettings(db)));

gradingApp.put("/settings", async (c) => {
  const parsed = gradingSettingsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  return c.json(await saveGradingSettings(db, parsed.data));
});

gradingApp.get("/models", async (c) => c.json(await gradingModels()));
