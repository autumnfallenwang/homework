// The only unauthenticated app routes (ADR 0004). Mounted at /api/public.
//
//   GET  /setup-state            first run? → the sign-in page offers "create the parent account"
//   GET  /invites/:token         what the /join page shows
//   POST /invites/:token/accept  create the child's login (join) or set a new password (reset)
//
// ⚠️ The token is a credential: it is never logged (only its hash is stored)
// and the request log masks it in the path (middleware/logger.ts `logPath`).

import { acceptInviteSchema, type SetupState } from "@homework/shared";
import { count } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { acceptInvite, InviteError, previewInvite } from "../services/invites.js";
import { inviteErrorStatus } from "./logins.js";

export const publicApp = new Hono();

publicApp.get("/setup-state", async (c) => {
  const [result] = await db.select({ value: count() }).from(users);
  const body: SetupState = { needsFirstParent: (result?.value ?? 0) === 0 };
  return c.json(body);
});

publicApp.get("/invites/:token", async (c) => {
  return c.json(await previewInvite(db, c.req.param("token")));
});

publicApp.post("/invites/:token/accept", async (c) => {
  const parsed = acceptInviteSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  try {
    return c.json(await acceptInvite(db, c.req.param("token"), parsed.data));
  } catch (err) {
    if (err instanceof InviteError) return c.json({ error: err.message }, inviteErrorStatus(err));
    throw err;
  }
});
