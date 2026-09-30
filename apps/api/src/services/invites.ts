// One-time invite links (ADR 0004). A parent issues a link for a profile; the
// child opens it and either creates their login ('join') or sets a new password
// ('reset'). The token rules follow OWASP's Forgot Password Cheat Sheet:
// 256 random bits, only the SHA-256 stored, single use, short expiry.

import { createHash, randomBytes } from "node:crypto";
import type {
  AcceptInviteInput,
  InvitePreview,
  InvitePurpose,
  IssuedInvite,
} from "@homework/shared";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { children, invites } from "../db/schema.js";
import { log } from "../lib/logger.js";
import { createChildLogin, findChildLogin, LoginError, setChildLoginPassword } from "./logins.js";

const TTL_MS: Record<InvitePurpose, number> = {
  join: 7 * 24 * 60 * 60 * 1000, // 7 days, as GitHub's organization invites
  reset: 24 * 60 * 60 * 1000, // 24 hours
};

export class InviteError extends Error {
  constructor(
    readonly code:
      | "child_not_found"
      | "already_has_login"
      | "no_login"
      | "invalid"
      | "expired"
      | "used"
      | "username_required"
      | "username_taken",
    message: string,
  ) {
    super(message);
    this.name = "InviteError";
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Issue a link for `childId`. A 'join' needs a profile with no login yet; a
 * 'reset' needs one with a login. Any unused link for the profile is cancelled,
 * so only the newest works.
 */
export async function issueInvite(
  db: Database,
  input: { childId: string; purpose: InvitePurpose; createdBy: string | null },
  now: Date = new Date(),
): Promise<IssuedInvite> {
  const [child] = await db
    .select({ id: children.id })
    .from(children)
    .where(eq(children.id, input.childId));
  if (!child) throw new InviteError("child_not_found", "Not found");
  const login = await findChildLogin(db, input.childId);
  if (input.purpose === "join" && login) {
    throw new InviteError("already_has_login", "This profile already has a login");
  }
  if (input.purpose === "reset" && !login) {
    throw new InviteError("no_login", "This profile has no login to reset");
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + TTL_MS[input.purpose]);
  await db.transaction(async (tx) => {
    await tx.delete(invites).where(and(eq(invites.childId, input.childId), isNull(invites.usedAt)));
    await tx.insert(invites).values({
      childId: input.childId,
      purpose: input.purpose,
      tokenHash: hashToken(token),
      expiresAt,
      createdBy: input.createdBy,
    });
  });
  log.info(
    {
      event: "invite.issued",
      child_id: input.childId,
      purpose: input.purpose,
      expires_at: expiresAt.toISOString(),
    },
    "invite link issued",
  );
  return {
    purpose: input.purpose,
    token,
    path: `/join/${token}`,
    expiresAt: expiresAt.toISOString(),
  };
}

/** The open (unused, unexpired) link for a profile, if any — for its card in Settings. */
export async function openInvite(db: Database, childId: string, now: Date = new Date()) {
  const [row] = await db
    .select({ purpose: invites.purpose, expiresAt: invites.expiresAt })
    .from(invites)
    .where(and(eq(invites.childId, childId), isNull(invites.usedAt), gt(invites.expiresAt, now)));
  return row
    ? { purpose: row.purpose as InvitePurpose, expiresAt: row.expiresAt.toISOString() }
    : null;
}

async function findByToken(db: Database, token: string) {
  const [row] = await db
    .select({
      id: invites.id,
      childId: invites.childId,
      purpose: invites.purpose,
      expiresAt: invites.expiresAt,
      usedAt: invites.usedAt,
      childName: children.displayName,
    })
    .from(invites)
    .innerJoin(children, eq(children.id, invites.childId))
    .where(eq(invites.tokenHash, hashToken(token)));
  return row ?? null;
}

function stateOf(row: { usedAt: Date | null; expiresAt: Date }, now: Date) {
  if (row.usedAt) return "used" as const;
  if (row.expiresAt <= now) return "expired" as const;
  return "valid" as const;
}

/** What the `/join/<token>` page shows before the child types anything. */
export async function previewInvite(
  db: Database,
  token: string,
  now: Date = new Date(),
): Promise<InvitePreview> {
  const row = await findByToken(db, token);
  if (!row) return { status: "invalid" };
  const state = stateOf(row, now);
  if (state !== "valid") return { status: state };
  const login = row.purpose === "reset" ? await findChildLogin(db, row.childId) : null;
  return {
    status: "valid",
    purpose: row.purpose as InvitePurpose,
    childName: row.childName,
    username: login?.displayUsername ?? login?.username ?? null,
    expiresAt: row.expiresAt.toISOString(),
  };
}

/**
 * Use a link. It is CLAIMED first by one conditional UPDATE, so two tabs
 * cannot both use it; if creating the login then fails (a taken username), the
 * claim is released and the child can try again with the same link.
 */
export async function acceptInvite(
  db: Database,
  token: string,
  input: AcceptInviteInput,
  now: Date = new Date(),
): Promise<{ username: string }> {
  const [claimed] = await db
    .update(invites)
    .set({ usedAt: now })
    .where(
      and(
        eq(invites.tokenHash, hashToken(token)),
        isNull(invites.usedAt),
        gt(invites.expiresAt, now),
      ),
    )
    .returning();
  if (!claimed) {
    const row = await findByToken(db, token);
    const state = row ? stateOf(row, now) : "invalid";
    const code = state === "valid" ? "used" : state; // lost a race to another tab
    log.warn({ event: "invite.rejected", reason: code }, "invite link refused");
    throw new InviteError(code, `This link is ${code === "invalid" ? "not valid" : code}`);
  }

  try {
    let result: { id: string; username: string };
    if (claimed.purpose === "join") {
      if (!input.username) throw new InviteError("username_required", "Choose a username");
      const [child] = await db
        .select({ displayName: children.displayName })
        .from(children)
        .where(eq(children.id, claimed.childId));
      result = await createChildLogin(db, {
        childId: claimed.childId,
        name: child?.displayName ?? input.username,
        username: input.username,
        password: input.password,
      });
    } else {
      result = await setChildLoginPassword(db, claimed.childId, input.password);
    }
    await db.update(invites).set({ usedBy: result.id }).where(eq(invites.id, claimed.id));
    log.info(
      {
        event: "invite.accepted",
        child_id: claimed.childId,
        purpose: claimed.purpose,
        user_id: result.id,
      },
      "invite link used",
    );
    return { username: result.username };
  } catch (err) {
    await db.update(invites).set({ usedAt: null }).where(eq(invites.id, claimed.id));
    if (err instanceof LoginError) throw new InviteError(err.code, err.message);
    throw err;
  }
}
