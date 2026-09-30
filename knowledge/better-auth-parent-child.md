---
name: better-auth-parent-child
description: Logins (ADR 0004/M09) — Better Auth 1.4.19 without the admin plugin, roles parent/child, users.child_id → children, invite links (hashed, single-use), API enforced by path; pitfalls: COOKIE_DOMAIN, lower-cased usernames, sign-out JSON body, plain-HTTP clipboard, token masking, required BETTER_AUTH_SECRET.
metadata:
  type: feedback
---

**Shape.** Better Auth 1.4.19 (the siblings' pin) in `apps/api/src/auth.ts`: Drizzle adapter
`usePlural`, `generateId: false`, email + password, `username` plugin. **No `admin` plugin** — it
needs an access-control policy for custom role names and its set-password needs an admin session;
`role`/`childId` are `input: false` additional fields and `services/logins.ts` does create /
set-password / remove through `auth.$context` (password hash + internal adapter). First user →
`parent` (create hook); `signupGate` closes sign-up after that. Child logins come only from
`services/invites.ts` (`/join/<token>`: 32 random bytes, SHA-256 stored, claimed by a conditional
UPDATE, 7 d join / 24 h reset, new link deletes unused ones, reset ends sessions).

**Enforcement is by path** in `middleware/auth.ts#authorize`: `/health`, `/api/auth/*`,
`/api/public/*` public; `/api/me` either role; `/api/child/*` child only (child from the session,
never the URL); **every other `/api/*` route parent-only** — a new route is parent-only by default.

**Pitfalls (each cost time here or in a sibling):**
- `COOKIE_DOMAIN=.arch.internal` on the api in the cluster, or sign-in returns 200 and every call
  401s (web and api are two hosts). Leave it UNSET locally.
- The username plugin lower-cases only on its own HTTP routes — `createChildLogin` must store
  `username` lower-cased (and `displayUsername` as typed) or username sign-in finds nothing.
- Better Auth rejects a bodiless POST (415): sign-out sends `{}` with a JSON content type.
- `navigator.clipboard` is absent on plain HTTP — use `lib/clipboard.ts` (execCommand fallback).
- Invite tokens sit in the URL path: `logPath()` masks `/api/public/invites/:token` in the request
  log. Better Auth logs a wrong password at `error`; auth.ts downgrades it to `warn`.
- The API exits at boot without `BETTER_AUTH_SECRET`; `scripts/create-cluster-secret.sh` refuses an
  env file missing it (the script REPLACES the whole Secret).
- Self-service goes through Better Auth, not our API: `POST /api/auth/change-password`
  (`revokeOtherSessions: true`) and `update-user` (name). The Account page lives in Settings for both
  roles; the sidebar name links there (`accountPathFor`).
- Global client providers (the theme) belong in the ROOT layout, never inside `SessionGate` — gated
  children mount only after `/api/me` returns, which flashed light mode on every dark-mode load.
- Tests: `createApp({ resolveSession: asParent | asChild() | asNobody })` (`src/test/sessions.ts`)
  for DB-free route tests. Never probe the real app with a parent session to test access — the
  handlers run (`POST /api/app/reset` would wipe the dev DB); `access.test.ts` probes `authorize` on
  a stub instead. Real flows: `auth.integration.test.ts` (cookie-keeping `browser()` helper).

Decision: [ADR 0004](../docs/adr/0004-accounts-and-roles.md). Related: [[wording-child]],
[[logging-pino-loki]], [[hono-route-conventions]], [[deploy-helm-arch-infra]].
