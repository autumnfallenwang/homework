// Logins (ADR 0004): Better Auth on the house setup (homecal /
// homeparentcontrol) with two roles, `parent` and `child`.
//
// ⚠️ No `admin` plugin, unlike the siblings. It only accepts custom role names
// with a full access-control policy, and its HTTP admin endpoints (impersonate,
// ban, set-role, …) are surface homework does not need. `role` and `childId`
// are additional fields no request can set (`input: false`); the three
// server-side operations a parent needs live in services/logins.ts.

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { count } from "drizzle-orm";
import { config } from "./config.js";
import { db } from "./db/index.js";
import * as schema from "./db/schema.js";
import { log } from "./lib/logger.js";

export type Role = "parent" | "child";

const WRONG_CREDENTIALS = /invalid (password|email)|user not found/i;

export const auth = betterAuth({
  secret: config.betterAuthSecret,
  baseURL: config.betterAuthUrl,
  /**
   * Better Auth's own output as one JSON line through pino (ADR 0003), not
   * its coloured console text. Only the message and an Error travel: its other
   * arguments can be request data. (Better Auth never hands a log handler its
   * `success` level, so every level maps onto pino's.)
   */
  logger: {
    log: (level, message, ...args) => {
      const err = args.find((arg) => arg instanceof Error);
      // A wrong password is a person typing, not a failure: Better Auth logs it
      // at `error`, which would put every typo into `| json | level="error"`.
      const lvl = level === "error" && WRONG_CREDENTIALS.test(message) ? "warn" : level;
      log[lvl]({ event: "auth.log", detail: message, ...(err ? { err } : {}) }, "better-auth");
    },
  },
  database: drizzleAdapter(db, { provider: "pg", usePlural: true, schema }),
  trustedOrigins: config.corsOrigins,
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      role: { type: "string", required: false, input: false, defaultValue: "child" },
      // The student profile a child's login belongs to — from an invite row.
      childId: { type: "string", required: false, input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days, as the siblings
    updateAge: 60 * 60 * 24, // refreshed daily while in use
  },
  advanced: {
    // Postgres generates the uuids.
    database: { generateId: false },
    ...(config.cookieDomain
      ? { crossSubDomainCookies: { enabled: true, domain: config.cookieDomain } }
      : {}),
  },
  databaseHooks: {
    user: {
      create: {
        // The first account ever created is the parent. After that the public
        // sign-up route is closed (middleware/auth.ts) and child logins are made
        // only from invites, with their role set explicitly.
        before: async (user) => {
          const [result] = await db.select({ value: count() }).from(schema.users);
          return result?.value === 0 ? { data: { ...user, role: "parent" } } : { data: user };
        },
      },
    },
  },
});
