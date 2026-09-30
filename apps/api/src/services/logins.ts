// Logins, server-side (ADR 0004, ADR 0005). Every login is the same shape — a
// name, an email (its sign-in), a password, a role. The first parent registers
// through Better Auth's sign-up (open only while there are no logins); a child's
// login is created here from an invite link, as ONE transaction (the user row
// and its credential account together) so a failure never leaves a login that
// cannot sign in. Better Auth is still used for what must match its sign-in: the
// password hash.

import type { Role } from "@homework/shared";
import { and, eq, ne } from "drizzle-orm";
import { auth } from "../auth.js";
import type { Database } from "../db/index.js";
import { accounts, sessions, users } from "../db/schema.js";

export class LoginError extends Error {
  constructor(
    readonly code: "email_taken" | "already_has_login" | "name_locked" | "no_login",
    message: string,
  ) {
    super(message);
    this.name = "LoginError";
  }
}

/** The app database, or a transaction on it. */
type Db = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

const normalizeEmail = (email: string) => email.trim().toLowerCase();

async function assertEmailFree(db: Db, email: string, exceptUserId?: string): Promise<void> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      exceptUserId
        ? and(eq(users.email, email), ne(users.id, exceptUserId))
        : eq(users.email, email),
    );
  if (row) throw new LoginError("email_taken", "That email is already used by another login");
}

/**
 * Two writes racing past `assertEmailFree` meet the database's unique
 * constraints instead — still a "taken", not a 500.
 */
function uniqueViolationToLoginError(err: unknown): never {
  const cause = (err as { cause?: { code?: string; constraint_name?: string } }).cause;
  if (cause?.code === "23505") {
    if (cause.constraint_name === "users_child_id_unique") {
      throw new LoginError("already_has_login", "This profile already has a login");
    }
    throw new LoginError("email_taken", "That email is already used by another login");
  }
  throw err;
}

/** A profile's child login, if it has one. */
export async function findChildLogin(db: Database, childId: string) {
  const [row] = await db.select().from(users).where(eq(users.childId, childId));
  return row ?? null;
}

/** A child's login for `childId`, from an invite link. */
export async function createChildLogin(
  db: Database,
  input: { childId: string; name: string; email: string; password: string },
): Promise<{ id: string; email: string }> {
  if (await findChildLogin(db, input.childId)) {
    throw new LoginError("already_has_login", "This profile already has a login");
  }
  const email = normalizeEmail(input.email);
  const hash = await (await auth.$context).password.hash(input.password);
  return db.transaction(async (tx) => {
    await assertEmailFree(tx, email);
    const [user] = await tx
      .insert(users)
      .values({
        name: input.name.trim(),
        email,
        role: "child" satisfies Role,
        childId: input.childId,
      })
      .returning({ id: users.id })
      .catch(uniqueViolationToLoginError);
    if (!user) throw new Error("login insert returned nothing");
    await tx
      .insert(accounts)
      .values({ accountId: user.id, providerId: "credential", password: hash, userId: user.id });
    return { id: user.id, email };
  });
}

/** Set a new password and end every session the login has. */
export async function setLoginPassword(db: Database, userId: string, password: string) {
  const hash = await (await auth.$context).password.hash(password);
  await db.transaction(async (tx) => {
    await tx
      .update(accounts)
      .set({ password: hash, updatedAt: new Date() })
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
  });
}

/** A reset link's job: a child profile's login gets a new password. */
export async function setChildLoginPassword(db: Database, childId: string, password: string) {
  const login = await findChildLogin(db, childId);
  if (!login) throw new LoginError("no_login", "This profile has no login");
  await setLoginPassword(db, login.id, password);
  return { id: login.id, email: login.email };
}

/**
 * Change your own login (`PATCH /api/me`). A child's name is refused: it
 * belongs to their child profile, which only a parent edits — it follows the
 * profile one way (ADR 0005). An email is each person's own sign-in.
 */
export async function updateOwnLogin(
  db: Database,
  me: { id: string; role: Role },
  patch: { name?: string; email?: string },
): Promise<void> {
  if (patch.name !== undefined && me.role === "child") {
    throw new LoginError("name_locked", "Your name is set by your parent");
  }
  const set: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.email !== undefined) {
    const email = normalizeEmail(patch.email);
    await assertEmailFree(db, email, me.id);
    set.email = email;
    set.emailVerified = false;
  }
  await db.update(users).set(set).where(eq(users.id, me.id)).catch(uniqueViolationToLoginError);
}

/** A profile's child login removed. Its sessions and password go with it (FK cascade). */
export async function removeChildLoginRow(db: Database, childId: string): Promise<boolean> {
  const deleted = await db
    .delete(users)
    .where(eq(users.childId, childId))
    .returning({ id: users.id });
  return deleted.length > 0;
}

/** For the recovery command: a login by its email. */
export async function findLoginByEmail(db: Database, email: string) {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)));
  return row ?? null;
}
