// Sign-in, first-run sign-up, session and invite links (ADR 0004), against
// Better Auth's own routes and the API's public ones. Hand-written fetches, as
// homeparentcontrol does — Better Auth itself is not in the web bundle.
//
// Plain HTTP on the LAN, accepted (as the sibling apps): the password never
// appears in a URL, a query string or a log line.

import type {
  AcceptedInvite,
  AcceptInviteInput,
  InvitePreview,
  Me,
  SetupState,
} from "@homework/shared";
import { apiBaseUrl } from "./api";

export class AuthError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    method: init?.method ?? "GET",
    // Better Auth refuses a POST without a JSON content type (415) — a bare
    // POST is how homeparentcontrol's first "Sign out" silently failed.
    headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    // The session is a cookie, so the browser has to be allowed to keep it.
    credentials: "include",
    cache: "no-store",
  });
  const parsed = (await res.json().catch(() => null)) as
    | (T & { message?: string; error?: string })
    | null;
  if (!res.ok) {
    throw new AuthError(
      res.status,
      parsed?.message ?? parsed?.error ?? `Request failed (${res.status})`,
    );
  }
  return parsed as T;
}

/** Parents sign in with their email, children with their username — one field takes either. */
export function signIn(identifier: string, password: string): Promise<unknown> {
  const id = identifier.trim();
  return id.includes("@")
    ? call("/api/auth/sign-in/email", { method: "POST", body: { email: id, password } })
    : call("/api/auth/sign-in/username", { method: "POST", body: { username: id, password } });
}

/**
 * Only the FIRST account can sign up, and it becomes the parent; after that the
 * API refuses (403). Children join through invite links.
 */
export function signUpParent(name: string, email: string, password: string): Promise<unknown> {
  return call("/api/auth/sign-up/email", {
    method: "POST",
    body: { name: name.trim(), email: email.trim(), password },
  });
}

/** An empty JSON body on purpose — see `call`. */
export function signOut(): Promise<unknown> {
  return call("/api/auth/sign-out", { method: "POST", body: {} });
}

/**
 * Change your own password (Better Auth checks the current one). Every OTHER
 * device is signed out; this one gets a fresh session.
 */
export function changePassword(currentPassword: string, newPassword: string): Promise<unknown> {
  return call("/api/auth/change-password", {
    method: "POST",
    body: { currentPassword, newPassword, revokeOtherSessions: true },
  });
}

/** Rename yourself. Only the parent's Account page offers it — a child's name comes from their profile. */
export function updateMyName(name: string): Promise<unknown> {
  return call("/api/auth/update-user", { method: "POST", body: { name: name.trim() } });
}

/** Where a user's own Account page is. */
export function accountPathFor(role: Me["user"]["role"]): string {
  return role === "child" ? "/child/settings/account" : "/settings/account";
}

/** Who is signed in, or null. */
export async function getMe(): Promise<Me | null> {
  try {
    return await call<Me>("/api/me");
  } catch (err) {
    if (err instanceof AuthError && err.status === 401) return null;
    throw err;
  }
}

export function getSetupState(): Promise<SetupState> {
  return call("/api/public/setup-state");
}

export function previewInvite(token: string): Promise<InvitePreview> {
  return call(`/api/public/invites/${encodeURIComponent(token)}`);
}

export function acceptInvite(token: string, input: AcceptInviteInput): Promise<AcceptedInvite> {
  return call(`/api/public/invites/${encodeURIComponent(token)}/accept`, {
    method: "POST",
    body: input,
  });
}

/** Where a signed-in user belongs. */
export function homeFor(me: Me): string {
  return me.user.role === "child" ? "/child" : "/";
}
