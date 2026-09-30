# 0004 — Accounts and roles: parent-managed profiles, invite-only child logins

- **Status:** accepted
- **Date:** 2026-09-29
- **Deciders:** project founder

## Context

The homework-page scraper does not cover the child's class, so homework will be entered by the
child and later reviewed by a parent (stage plan: stages 1–5, one milestone each; this ADR is
stage 1). That needs something homework has never had: **logins, and two kinds of user.** Until
now the app was single-user with no auth ([ADR 0001](./0001-initial-stack.md), M04): every API
route was open to the LAN and the web showed one set of tabs.

What the stages need:

- a **parent** who sees the whole app as it is today and manages everything else;
- a **child** who sees only their own small area and can never reach the parent's data, settings or
  the TeacherEase credentials — which are the **parent's** TeacherEase portal login (the scraper
  signs into `/App/Parents/…`), not the child's;
- a child login tied to exactly one existing child profile, set up without email (internal app).

**Wording.** "Child" everywhere — code, API, UI, docs. A *child profile* is a `children` row (the
student: grades, homework, data sources); a *child login* is a user with role `child`.

The sibling apps already run logins: `homecal` and `homeparentcontrol` both use **Better Auth
1.4.19** on Hono + Drizzle (`usePlural`, Postgres-generated uuids, `admin` plugin, 7-day sessions,
session cookie shared across the `*.arch.internal` web and API hosts), first sign-up becomes the
admin, public sign-up closed after that (homeparentcontrol's `signup-gate.ts`).
homeparentcontrol's web talks to Better Auth with a small hand-written fetch client. `homenews` has
no auth.

## Decision

**1. Better Auth, the house setup — minus the admin plugin.** Better Auth 1.4.19 (the siblings'
pin), Drizzle adapter (`usePlural`, `generateId: false`), email + password, the `username` plugin
(children sign in with a username), 7-day sessions refreshed daily, Better Auth's logger through
pino (ADR 0003; wrong-password messages at `warn`, not `error`). The web uses a hand-written fetch
client (homeparentcontrol pattern); Better Auth is not in the web bundle.

**Deviation from the siblings: no `admin` plugin.** It accepts custom role names (`parent`,
`child`) only with a full access-control policy, and its HTTP admin endpoints (impersonate, ban,
set-role, set-password) are surface homework does not need; its `set-user-password` also requires
an admin *session*, which a child accepting a reset link does not have. Instead `role` and
`childId` are Better Auth additional user fields that no request can set (`input: false`), and the
three server-side operations — create a child login, set its password, remove it — use Better
Auth's own context (its password hashing and internal adapter, the same calls its endpoints make)
in `services/logins.ts`.

**2. A login is not a profile.** `children` stays the **child profile**: name, grade, school and
its data sources (the parent's TeacherEase login, the optional homework page). Grades, classes,
homework and fetch runs keep pointing at it. A login is a Better Auth `users` row with a `role`:

```
users.role      'parent' | 'child'
users.child_id  → children.id    NULL for a parent · required for a child · unique · ON DELETE CASCADE
                CHECK (role <> 'child' OR child_id IS NOT NULL)    -- users_child_role_has_child
```

The link lives on `users` because every request starts from the session; `child_id` arrives with
it. Removing a login never touches a profile's history; deleting a profile removes its child login.

**3. Who manages what.** The parent creates and edits profiles and their data sources in Settings →
Children, as before. A child can read their own profile's name, grade and school — never the data
sources. The first account ever created becomes `parent`; public sign-up is then closed.

**4. Child logins are created by invite link, never by open sign-up.** On a child's card the
parent clicks one button and gets a one-time link, `/join/<token>`, and hands it over (chat, in
person — no email). The child opens it, picks a username and password, and is signed in; the
server creates `role: 'child'` with `child_id` from the **invite row**, never from the request. A
password reset is the same mechanism with `purpose: 'reset'`. The link follows the usual rules for
such tokens (OWASP Forgot Password Cheat Sheet):

```
invites: id · child_id → children.id (CASCADE) · purpose 'join' | 'reset'
         token_hash (sha256, unique) · expires_at · used_at · used_by → users.id
         created_by → users.id · created_at
```

- 32 random bytes (256 bits) from `crypto.randomBytes`, returned once, stored only as a SHA-256 hash;
- single use: claimed by one conditional `UPDATE … WHERE used_at IS NULL AND expires_at > now()`,
  so two tabs cannot both use it; a failed login creation (username taken) releases the claim;
- expiry: 7 days for a join link, 24 hours for a reset link; issuing a new link deletes the
  profile's unused ones; a reset ends every session of that login;
- the token never reaches the logs: the request log masks `/api/public/invites/:token`;
- sign-in and the public routes are rate-limited per client IP (`hono-rate-limiter`, as
  homeparentcontrol).

**5. The API is the enforcement point.** Public: `/health`, Better Auth's `/api/auth/*`, and
`/api/public/*` (first-run state, invite look-up and accept). Everything else needs a session:
`/api/me` for either role, `/api/child/*` for children only — the child always taken from the
session — and **every other route parent-only**, which covers every route that existed before.

**6. Cookies.** In the cluster the session cookie is set for `.arch.internal` (`COOKIE_DOMAIN`) so it
travels from `homework.arch.internal` to `homework-api.arch.internal`; in local dev it stays
host-only. Plain HTTP on the LAN, as the sibling apps accept.

Alternatives considered:

- **Merge children into users** (the child's login *is* the profile) — rejected: it would put the
  parent's TeacherEase password in the child's account row, a profile could not exist without a
  login, and every data table would have to move its foreign key.
- **Parent types the child's username and password** — works, but the child never chooses their own
  password; the invite link makes it unnecessary.
- **Open self sign-up plus "pick your profile" or parent approval** — rejected: anyone on the Wi-Fi
  could claim a profile, and matching by name is fragile.
- **Better Auth's organization invitations** — email-based and built around multi-member
  organizations; a small `invites` table is less than one family needs.
- **Hand-rolled sessions**, **auth at the ingress**, **a separate child app** — rejected: the house
  already runs Better Auth, the app needs roles inside it, and one codebase is cheaper than two.

## Consequences

**Positive:** the API is no longer open to anyone on the LAN; stages 2–4 get a trustworthy "who is
this, which child" from the session; the child picks their own password; the pattern and its known
pitfalls (cookie domain, sign-out needs a JSON body, sign-up gate, clipboard on plain HTTP) match
the sibling apps.

**Trade-offs:**

- Every existing API route needs a parent session. The web already sent `credentials: "include"`
  and every page is a client component, so no server-side fetch broke.
- New secret `BETTER_AUTH_SECRET` in `homework-secrets`; the API refuses to start without it
  (except under tests). Local dev needs it in `apps/api/.env` (see `.env.example`).
- **First-run claim:** after the release, the first person to open the app creates the parent
  account. Acceptable on a home LAN; do it right after the release.
- The scheduler and email digest are unaffected: they run in-process, not over HTTP.
- `services/logins.ts` uses Better Auth's internal adapter, which is less stable across Better Auth
  upgrades than its public endpoints; the auth integration tests cover every path it takes.
- The parent can still reveal the stored TeacherEase password in Settings (it is theirs). Making it
  write-only, and encrypting portal/SMTP passwords at rest (M02), remain deferred.

**Open risks:** plain HTTP means someone on the home Wi-Fi could read an invite link or cookie in
transit — the same risk the sibling apps accept, narrowed by single use and expiry. If the app is
ever reachable from outside the home network, HTTPS becomes mandatory first.

## Notes

- Implemented in [milestone 09](../milestones/09-accounts-and-roles.md).
- Lifts ADR 0001's "no auth" constraint and the architecture non-goal "multi-user accounts,
  authentication … future work".
- House references: homeparentcontrol `apps/api/src/auth.ts`, `middleware/auth.ts`,
  `middleware/signup-gate.ts`, `middleware/rate-limit.ts`, `apps/web/src/lib/auth-client.ts`,
  `lib/clipboard.ts`; homecal `docs/lessons.md` (Better Auth gotchas).
