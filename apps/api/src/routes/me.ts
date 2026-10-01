// Who is signed in (ADR 0004). `GET /api/me` answers both roles; the web uses
// it to route a parent to the app and a child to /child. `GET /api/child/profile` is
// what a child may read about their own profile — never its data sources.

import { type ChildProfile, type Me, updateMeSchema } from "@homework/shared";
import { Hono } from "hono";
import { db } from "../db/index.js";
import * as q from "../db/queries.js";
import type { AuthVariables } from "../middleware/auth.js";
import { LoginError, updateOwnLogin } from "../services/logins.js";

export const meApp = new Hono<{ Variables: AuthVariables }>();

meApp.get("/", async (c) => {
  const user = c.get("user");
  const child = user.childId ? await q.getChild(db, user.childId) : null;
  const body: Me = {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    child: child ? { id: child.id, displayName: child.displayName } : null,
  };
  return c.json(body);
});

/** Change your own login — name (a child's is locked), email (ADR 0005). */
meApp.patch("/", async (c) => {
  const parsed = updateMeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  const user = c.get("user");
  try {
    await updateOwnLogin(db, user, parsed.data);
  } catch (err) {
    if (err instanceof LoginError) {
      return c.json({ error: err.message }, err.code === "name_locked" ? 403 : 409);
    }
    throw err;
  }
  return c.json({ ok: true });
});

export const childAreaApp = new Hono<{ Variables: AuthVariables }>();

childAreaApp.get("/profile", async (c) => {
  const { childId } = c.get("user");
  const child = childId ? await q.getChild(db, childId) : null;
  if (!child) return c.json({ error: "Not found" }, 404);
  const body: ChildProfile = {
    displayName: child.displayName,
    grade: child.grade,
    school: child.school,
    homeworkEntry: child.homeworkSource === "child",
  };
  return c.json(body);
});
