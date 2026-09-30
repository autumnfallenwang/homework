// Who is signed in (ADR 0004). `GET /api/me` answers both roles; the web uses
// it to route a parent to the app and a child to /child. `GET /api/child/profile` is
// what a child may read about their own profile — never its data sources.

import type { ChildProfile, Me } from "@homework/shared";
import { Hono } from "hono";
import { db } from "../db/index.js";
import * as q from "../db/queries.js";
import type { AuthVariables } from "../middleware/auth.js";

export const meApp = new Hono<{ Variables: AuthVariables }>();

meApp.get("/", async (c) => {
  const user = c.get("user");
  const child = user.childId ? await q.getChild(db, user.childId) : null;
  const body: Me = {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
    },
    child: child ? { id: child.id, displayName: child.displayName } : null,
  };
  return c.json(body);
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
  };
  return c.json(body);
});
