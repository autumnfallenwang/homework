// Who may call what (ADR 0004). The API is the enforcement point — the web's
// role routing is convenience, never security.
//
//   public      /health, /api/auth/* (Better Auth), /api/public/*
//   either role /api/me
//   child only    /api/child/*   — the child always comes from the session
//   parent only every other /api/* route (everything that existed before)

import type { Role } from "@homework/shared";
import { count } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { auth } from "../auth.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { log, withLogContext } from "../lib/logger.js";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: Role;
  childId: string | null;
}

/** Hono variables set once a request is authorised. */
export type AuthVariables = { user: SessionUser };

/** Resolves request headers to the signed-in user — injectable so route tests need no DB. */
export type ResolveSession = (headers: Headers) => Promise<SessionUser | null>;

export const betterAuthSession: ResolveSession = async (headers) => {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const u = session.user as typeof session.user & {
    role?: string;
    childId?: string | null;
    username?: string | null;
  };
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    username: u.username ?? null,
    // Anything but an explicit parent is treated as the least-privileged role.
    role: u.role === "parent" ? "parent" : "child",
    childId: u.childId ?? null,
  };
};

const isPublic = (path: string) =>
  !path.startsWith("/api/") || path.startsWith("/api/auth/") || path.startsWith("/api/public/");

export function requiredRole(path: string): Role | "any" {
  if (path === "/api/me") return "any";
  if (path.startsWith("/api/child/")) return "child";
  return "parent";
}

export function authorize(resolveSession: ResolveSession): MiddlewareHandler {
  return async (c, next) => {
    const path = c.req.path;
    if (isPublic(path)) return next();

    let user: SessionUser | null;
    try {
      user = await resolveSession(c.req.raw.headers);
    } catch {
      // Better Auth throws on a malformed cookie; that is a missing session, not a 500.
      user = null;
    }
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const need = requiredRole(path);
    if (need !== "any" && user.role !== need) {
      log.warn(
        { event: "auth.forbidden", user_id: user.id, role: user.role, path },
        "role not allowed here",
      );
      return c.json({ error: "Forbidden" }, 403);
    }
    c.set("user", user);
    // Every line this request logs says who made it.
    return withLogContext({ user_id: user.id }, next);
  };
}

/**
 * Public sign-up is open only until the first account exists — that account is
 * the parent. After that, child logins come from invite links only. (Better
 * Auth's `disableSignUp` is a static flag and cannot say "open until the first
 * user"; homeparentcontrol's signup-gate, same reasoning.)
 */
export const signupGate: MiddlewareHandler = async (c, next) => {
  if (c.req.method !== "POST" || !c.req.path.startsWith("/api/auth/sign-up/")) return next();
  const [result] = await db.select({ value: count() }).from(users);
  if ((result?.value ?? 0) > 0) {
    log.warn({ event: "auth.signup_closed" }, "sign-up refused: an account already exists");
    return c.json({ error: "Sign-up is closed. Ask a parent for an invite link." }, 403);
  }
  return next();
};

/** Best-effort client IP. Behind Traefik the real address is in x-forwarded-for. */
export function clientIp(c: Context): string {
  const fwd = c.req.header("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "anon";
}

/**
 * Per-IP limits on the doors a stranger can knock on: password sign-in and the
 * public invite routes (house pattern: hono-rate-limiter, as homeparentcontrol).
 * An invite token is 256 random bits, so guessing is already hopeless; this
 * stops password guessing and noise.
 */
export function publicRateLimiter(limit: number): MiddlewareHandler {
  return rateLimiter({
    windowMs: 60_000,
    limit,
    standardHeaders: "draft-7",
    keyGenerator: clientIp,
    message: { error: "Too many requests" },
  });
}
