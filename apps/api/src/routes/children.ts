// Children CRUD. Mounted at /api/children. Ports the addChild / getChildren /
// getChild / update* / removeChild / getChildPassword IPC commands.

import { addChildSchema, patchChildSchema } from "@homework/shared";
import { Hono } from "hono";
import { db } from "../db/index.js";
import * as q from "../db/queries.js";

export const childrenApp = new Hono();

childrenApp.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = addChildSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  const id = await q.addChild(db, parsed.data);
  return c.json(await q.getChild(db, id), 201);
});

childrenApp.get("/", async (c) => {
  return c.json(await q.getChildren(db));
});

childrenApp.get("/:id", async (c) => {
  const child = await q.getChild(db, c.req.param("id"));
  if (!child) return c.json({ error: "Not found" }, 404);
  return c.json(child);
});

childrenApp.get("/:id/password", async (c) => {
  const id = c.req.param("id");
  const child = await q.getChild(db, id);
  if (!child) return c.json({ error: "Not found" }, 404);
  return c.json({ password: await q.getChildPassword(db, id) });
});

childrenApp.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = patchChildSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  const existing = await q.getChild(db, id);
  if (!existing) return c.json({ error: "Not found" }, 404);

  const { displayName, username, password, homeworkUrl } = parsed.data;
  if (displayName !== undefined || username !== undefined) {
    await q.updateChildIdentity(db, id, {
      displayName: displayName ?? existing.displayName,
      username: username ?? existing.username,
    });
  }
  if (password !== undefined) await q.updateChildPassword(db, id, password);
  if (homeworkUrl !== undefined) await q.setHomeworkUrl(db, id, homeworkUrl);

  return c.json(await q.getChild(db, id));
});

childrenApp.delete("/:id", async (c) => {
  const ok = await q.removeChild(db, c.req.param("id"));
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.body(null, 204);
});
