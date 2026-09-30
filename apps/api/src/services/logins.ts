// Child logins, server-side (ADR 0004). What Better Auth's admin plugin would do
// over HTTP, done here through Better Auth's own context — the same password
// hashing and internal adapter its endpoints use — so a child accepting a reset
// link (who has no session) can be served, and no admin HTTP surface exists.

import { eq } from "drizzle-orm";
import { auth } from "../auth.js";
import type { Database } from "../db/index.js";
import { users } from "../db/schema.js";

export class LoginError extends Error {
  constructor(
    readonly code: "username_taken" | "already_has_login" | "no_login",
    message: string,
  ) {
    super(message);
    this.name = "LoginError";
  }
}

/** Better Auth needs an email on every user; a child's is a placeholder never shown. */
export function childLoginEmail(childId: string): string {
  return `child-${childId}@homework.invalid`;
}

/** A profile's child login, if it has one. */
export async function findChildLogin(db: Database, childId: string) {
  const [row] = await db.select().from(users).where(eq(users.childId, childId));
  return row ?? null;
}

/**
 * Create the child login for `childId`. The username plugin's normaliser runs only
 * on its own HTTP routes, so the lower-cased form is stored here — sign-in by
 * username looks up exactly that.
 */
export async function createChildLogin(
  db: Database,
  input: { childId: string; name: string; username: string; password: string },
): Promise<{ id: string; username: string }> {
  const username = input.username.trim().toLowerCase();
  if (await findChildLogin(db, input.childId)) {
    throw new LoginError("already_has_login", "This profile already has a login");
  }
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
  if (taken) throw new LoginError("username_taken", "That username is taken");

  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({
    email: childLoginEmail(input.childId),
    name: input.name,
    username,
    displayUsername: input.username.trim(),
    role: "child",
    childId: input.childId,
  });
  try {
    await ctx.internalAdapter.linkAccount({
      accountId: user.id,
      providerId: "credential",
      password: await ctx.password.hash(input.password),
      userId: user.id,
    });
  } catch (err) {
    // No half-made login: without its credential account it cannot sign in.
    await db.delete(users).where(eq(users.id, user.id));
    throw err;
  }
  return { id: user.id, username };
}

/** Set a new password and end every session the login has. */
export async function setChildLoginPassword(db: Database, childId: string, password: string) {
  const login = await findChildLogin(db, childId);
  if (!login) throw new LoginError("no_login", "This profile has no login");
  const ctx = await auth.$context;
  await ctx.internalAdapter.updatePassword(login.id, await ctx.password.hash(password));
  await ctx.internalAdapter.deleteSessions(login.id);
  return { id: login.id, username: login.username ?? "" };
}

/** Remove a profile's child login. Its sessions and password go with it (FK cascade). */
export async function removeChildLoginRow(db: Database, childId: string): Promise<boolean> {
  const deleted = await db
    .delete(users)
    .where(eq(users.childId, childId))
    .returning({ id: users.id });
  return deleted.length > 0;
}
