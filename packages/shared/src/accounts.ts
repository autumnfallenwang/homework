// Logins, roles and invite links (ADR 0004, ADR 0005). Every login has the same
// shape — a name, an email (its sign-in), a password, a role (`parent` |
// `child`). A LOGIN is not a PROFILE (`ChildRecord`): a child's login points at
// one child profile, and the profile owns the child's name.

import { z } from "zod";

export const roleSchema = z.enum(["parent", "child"]);
export type Role = z.infer<typeof roleSchema>;

export const invitePurposeSchema = z.enum(["join", "reset"]);
export type InvitePurpose = z.infer<typeof invitePurposeSchema>;

/** Every login's sign-in. Stored lower-cased; sign-in is case-insensitive. */
export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email");

/** Better Auth's default password bounds. */
export const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(128, "At most 128 characters");

// --- Requests ---

export const createInviteSchema = z.object({ purpose: invitePurposeSchema });
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

/** Accepting a link: a join needs the child's email; a reset only a new password. */
export const acceptInviteSchema = z.object({
  email: emailSchema.optional(),
  password: passwordSchema,
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

/**
 * `PATCH /api/me` — change your own login. A child's `name` is refused: it
 * belongs to their child profile, which only a parent edits (ADR 0005).
 */
export const updateMeSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(80).optional(),
    email: emailSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.email !== undefined, { message: "Nothing to change" });
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

// --- Responses ---

/** `GET /api/me` — who is signed in, and (for a child) whose profile. */
export interface Me {
  user: { id: string; name: string; email: string; role: Role };
  child: { id: string; displayName: string } | null;
}

/** `GET /api/public/setup-state` — the first run asks for the parent account. */
export interface SetupState {
  needsFirstParent: boolean;
}

/** `GET /api/children/:id/login` — a profile's login and any open link. */
export interface ChildLogin {
  login: { userId: string; email: string; createdAt: string } | null;
  invite: { purpose: InvitePurpose; expiresAt: string } | null;
}

/** `POST /api/children/:id/invites` — the token is returned ONCE; only its hash is kept. */
export interface IssuedInvite {
  purpose: InvitePurpose;
  token: string;
  path: string;
  expiresAt: string;
}

/** `GET /api/public/invites/:token`. For a reset, `email` is the login being reset. */
export type InvitePreview =
  | {
      status: "valid";
      purpose: InvitePurpose;
      childName: string;
      email: string | null;
      expiresAt: string;
    }
  | { status: "invalid" | "expired" | "used" };

/** `POST /api/public/invites/:token/accept` — the web then signs in with it. */
export interface AcceptedInvite {
  email: string;
}

/** `GET /api/child/profile` — what a child may read about their own profile. */
export interface ChildProfile {
  displayName: string;
  grade: string | null;
  school: string | null;
  /** The parent turned on "Child enters homework" for this profile (ADR 0006). */
  homeworkEntry: boolean;
}
