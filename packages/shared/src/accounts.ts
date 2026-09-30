// Logins, roles and invite links (ADR 0004). A LOGIN (Better Auth user, role
// `parent` | `child`) is not a PROFILE (`ChildRecord`); a child's login points at
// one profile.

import { z } from "zod";

export const roleSchema = z.enum(["parent", "child"]);
export type Role = z.infer<typeof roleSchema>;

export const invitePurposeSchema = z.enum(["join", "reset"]);
export type InvitePurpose = z.infer<typeof invitePurposeSchema>;

/**
 * A child's username: 3–30 letters, digits, `_` or `.` — the same rule as Better
 * Auth's username plugin, so a later rename through it keeps working. Stored
 * lower-cased; sign-in is case-insensitive.
 */
export const childUsernameSchema = z
  .string()
  .trim()
  .min(3, "At least 3 characters")
  .max(30, "At most 30 characters")
  .regex(/^[A-Za-z0-9_.]+$/, "Letters, numbers, _ and . only");

/** Better Auth's default password bounds. */
export const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(128, "At most 128 characters");

// --- Requests ---

export const createInviteSchema = z.object({ purpose: invitePurposeSchema });
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

/** Accepting a link: a join needs a username; a reset only a new password. */
export const acceptInviteSchema = z.object({
  username: childUsernameSchema.optional(),
  password: passwordSchema,
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

// --- Responses ---

/** `GET /api/me` — who is signed in, and (for a child) whose profile. */
export interface Me {
  user: { id: string; name: string; email: string; username: string | null; role: Role };
  child: { id: string; displayName: string } | null;
}

/** `GET /api/public/setup-state` — the first run asks for the parent account. */
export interface SetupState {
  needsFirstParent: boolean;
}

/** `GET /api/children/:id/login` — a profile's login and any open link. */
export interface ChildLogin {
  login: { userId: string; username: string | null; createdAt: string } | null;
  invite: { purpose: InvitePurpose; expiresAt: string } | null;
}

/** `POST /api/children/:id/invites` — the token is returned ONCE; only its hash is kept. */
export interface IssuedInvite {
  purpose: InvitePurpose;
  token: string;
  path: string;
  expiresAt: string;
}

/** `GET /api/public/invites/:token`. */
export type InvitePreview =
  | {
      status: "valid";
      purpose: InvitePurpose;
      childName: string;
      username: string | null;
      expiresAt: string;
    }
  | { status: "invalid" | "expired" | "used" };

/** `POST /api/public/invites/:token/accept` — the web then signs in with it. */
export interface AcceptedInvite {
  username: string;
}

/** `GET /api/child/profile` — what a child may read about their own profile. */
export interface ChildProfile {
  displayName: string;
  grade: string | null;
  school: string | null;
}
