---
name: better-auth-parent-child
description: Logins (ADR 0004 + 0005, M09) — Better Auth 1.4.19, no plugins; every login = name + email (its sign-in) + password + role parent/child; users.child_id → children (profile owns a child's name); invite links; PATCH /api/me is the one self-service door; path-based enforcement; pitfalls.
metadata:
  type: feedback
---

**Shape (ADR 0005).** Every login is the same: **name, email (the sign-in), password, role**
(`parent` | `child`). No usernames anywhere. Better Auth 1.4.19 (the siblings' pin) in
`apps/api/src/auth.ts`: Drizzle adapter `usePlural`, `generateId: false`, email + password, **no
plugins** (no `admin` — it needs an access-control policy for custom roles; no `username`).
`role` / `childId` are `input: false` additional fields.

**Creation.** First run: Better Auth's `POST /api/auth/sign-up/email` (name, email, password) — open
only while there are no logins (`authRouteGate`), the create hook makes it `parent`. A child:
`services/invites.ts` → `services/logins.ts#createChildLogin` from an invite link (email + password;
the name is the child profile's), ONE Drizzle transaction for the user row + its credential account
(`auth.$context.password.hash` for the hash). Links: 32 random bytes, SHA-256 stored, claimed by a
conditional UPDATE, 7 d join / 24 h reset, a new link deletes unused ones, a reset ends sessions.

**Self-service.** `PATCH /api/me` (name, email) is the one door; Better Auth's `update-user` /
`change-email` return 404. A child's name is refused there (403): it belongs to the child profile
and follows it one way (`queries.updateChildIdentity` renames the login too). Emails are unique
(409). Passwords: Better Auth `change-password` with `revokeOtherSessions: true`. Forgotten parent
password (no email sending): `kubectl -n homework exec deploy/homework-api -- node --import tsx
src/scripts/reset-password.ts <email>` prints a one-time password.

**Enforcement is by path** (`middleware/auth.ts#authorize`): `/health`, `/api/auth/*`,
`/api/public/*` public; `/api/me` either role; `/api/child/*` child only (child from the session,
never the URL); **every other `/api/*` route parent-only** — a new route is parent-only by default.

**Pitfalls (each cost time here or in a sibling):**
- `COOKIE_DOMAIN=.arch.internal` on the api in the cluster, or sign-in returns 200 and every call
  401s (web and api are two hosts). Leave it UNSET locally.
- `children.username` is the TeacherEase PORTAL username (a data source), not a login field.
- Better Auth rejects a bodiless POST (415): sign-out sends `{}` with a JSON content type.
- `navigator.clipboard` is absent on plain HTTP — use `lib/clipboard.ts` (execCommand fallback).
- Invite tokens sit in the URL path: `logPath()` masks `/api/public/invites/:token` in the request
  log. Better Auth logs a wrong password at `error`; auth.ts downgrades it to `warn`.
- The API exits at boot without `BETTER_AUTH_SECRET`; `scripts/create-cluster-secret.sh` refuses an
  env file missing it (the script REPLACES the whole Secret).
- Global client providers (the theme) belong in the ROOT layout, never inside `SessionGate` — gated
  children mount only after `/api/me` returns (a light flash on every dark-mode load).
- Tests: `createApp({ resolveSession: asParent | asChild() | asNobody })` (`src/test/sessions.ts`)
  for DB-free route tests. Never probe the real app with a parent session to test access — the
  handlers run (`POST /api/app/reset` would wipe the dev DB); `access.test.ts` probes `authorize` on
  a stub instead. Real flows: `auth.integration.test.ts` (cookie-keeping `browser()` helper).

Decisions: [ADR 0004](../docs/adr/0004-accounts-and-roles.md),
[ADR 0005](../docs/adr/0005-email-sign-in-for-everyone.md). Related: [[wording-child]],
[[logging-pino-loki]], [[hono-route-conventions]], [[deploy-helm-arch-infra]].
