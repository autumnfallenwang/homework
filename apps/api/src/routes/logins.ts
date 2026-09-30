// A profile's child login, managed by the parent (ADR 0004). Mounted at
// /api/children beside childrenApp; parent-only via middleware/auth.ts.

import { type ChildLogin, createInviteSchema } from "@homework/shared";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import * as q from "../db/queries.js";
import { log } from "../lib/logger.js";
import type { AuthVariables } from "../middleware/auth.js";
import { InviteError, issueInvite, openInvite } from "../services/invites.js";
import { findChildLogin, removeChildLoginRow } from "../services/logins.js";

export const childLoginsApp = new Hono<{ Variables: AuthVariables }>();

const idSchema = z.string().uuid();

/** InviteError codes → the house's flat `{ error }` with a status. */
export function inviteErrorStatus(err: InviteError): 400 | 403 | 404 | 409 | 410 {
  switch (err.code) {
    case "child_not_found":
    case "invalid":
      return 404;
    case "expired":
    case "used":
      return 410;
    case "email_required":
      return 400;
    case "name_locked":
      return 403;
    default:
      return 409;
  }
}

childLoginsApp.get("/:id/login", async (c) => {
  const id = c.req.param("id");
  if (!idSchema.safeParse(id).success || !(await q.getChild(db, id))) {
    return c.json({ error: "Not found" }, 404);
  }
  const login = await findChildLogin(db, id);
  const body: ChildLogin = {
    login: login
      ? { userId: login.id, email: login.email, createdAt: login.createdAt.toISOString() }
      : null,
    invite: await openInvite(db, id),
  };
  return c.json(body);
});

childLoginsApp.post("/:id/invites", async (c) => {
  const id = c.req.param("id");
  if (!idSchema.safeParse(id).success) return c.json({ error: "Not found" }, 404);
  const parsed = createInviteSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  try {
    const issued = await issueInvite(db, {
      childId: id,
      purpose: parsed.data.purpose,
      createdBy: c.get("user")?.id ?? null,
    });
    return c.json(issued, 201);
  } catch (err) {
    if (err instanceof InviteError) return c.json({ error: err.message }, inviteErrorStatus(err));
    throw err;
  }
});

childLoginsApp.delete("/:id/login", async (c) => {
  const id = c.req.param("id");
  if (!idSchema.safeParse(id).success || !(await removeChildLoginRow(db, id))) {
    return c.json({ error: "Not found" }, 404);
  }
  log.info({ event: "login.removed", child_id: id }, "child login removed");
  return c.body(null, 204);
});
