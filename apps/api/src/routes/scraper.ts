// Scraper validation endpoints. Mounted at /api/scraper. These validate user
// input against the live portal without persisting anything — used by the
// add/edit-child forms. Errors map to a typed { ok, code } body (HTTP 200) so
// the frontend can translate, mirroring the desktop app's behavior.

import { homeworkUrlCheckSchema, loginCheckSchema } from "@homework/shared";
import { Hono } from "hono";
import { validateHomeworkUrl } from "../scraper/homework-url.js";
import { login } from "../scraper/teacherease.js";
import { createNodeFetch } from "../scraper/transport.js";
import { HomeworkUrlError, LoginError } from "../scraper/types.js";

export const scraperApp = new Hono();

scraperApp.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginCheckSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  const { baseUrl, username, password } = parsed.data;
  try {
    await login(baseUrl, { username, password }, createNodeFetch());
    return c.json({ ok: true });
  } catch (err) {
    const code = err instanceof LoginError ? err.code : "unknown";
    return c.json({ ok: false, code });
  }
});

scraperApp.post("/validate-homework-url", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = homeworkUrlCheckSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  try {
    await validateHomeworkUrl(parsed.data.url, createNodeFetch());
    return c.json({ ok: true });
  } catch (err) {
    const code = err instanceof HomeworkUrlError ? err.code : "unknown";
    return c.json({ ok: false, code });
  }
});
