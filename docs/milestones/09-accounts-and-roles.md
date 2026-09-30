---
name: 09-accounts-and-roles
status: in-progress
created: 2026-09-29
---

# Milestone 09 — Accounts and roles (stage 1)

Stage 1 of the child-homework plan ([ADR 0004](../adr/0004-accounts-and-roles.md)): logins with two
roles. The parent keeps every tab of the app, manages child profiles in Settings → Children as
before, and gives a child their login with a **one-time invite link**. The child signs in to their
own area. Stages 2–4 show as **clearly labelled placeholder cards** on both sides, so the whole
shape of the product can be reviewed in production before those stages are built.

Wording: "child" everywhere ([[wording-child]]) — a *child profile* is a `children` row, a *child login*
is a user with role `child`.

## Goal

Opening `http://homework.arch.internal` asks you to sign in (the very first visit asks you to create
the parent account). On a child's card you click **Create invite link** and send the link; the child
picks a username and password and lands in the child area. Without a session every API route
answers 401; with a child session every parent route answers 403.

## Scope / deliverables

`apps/api`:
- `better-auth@1.4.19`, `hono-rate-limiter@0.5.3`; `src/auth.ts` on the house setup (Drizzle adapter,
  `usePlural`, Postgres uuids, email + password, `username` plugin, 7-day sessions,
  `crossSubDomainCookies` only with `COOKIE_DOMAIN`, logger through pino, first user → `parent`).
  **No `admin` plugin** (ADR 0004): `role` / `childId` are non-settable additional fields.
- Schema + migration `0001_accounts_and_invites`: `users` (+ `username`, `display_username`, `role`,
  `child_id` UNIQUE / CASCADE / CHECK `users_child_role_has_child`), `sessions`, `accounts`,
  `verifications`, `invites`.
- `services/logins.ts` (create a child login, set its password + end its sessions, remove it — via
  Better Auth's context) and `services/invites.ts` (issue, preview, claim-then-accept).
- `middleware/auth.ts`: session resolution (injectable for tests), `authorize` by path
  (public / either / child-only / parent-only), `signupGate`, per-IP `publicRateLimiter`.
- Routes: `/api/auth/*` → Better Auth; public `GET /api/public/setup-state`,
  `GET /api/public/invites/:token`, `POST /api/public/invites/:token/accept`; `GET /api/me`;
  child-only `GET /api/child/profile`; parent-only `GET /api/children/:id/login`,
  `POST /api/children/:id/invites`, `DELETE /api/children/:id/login`. Every existing route
  parent-only. Request log masks invite tokens and records `user_id`.
- `BETTER_AUTH_SECRET` required at boot (one `fatal` `config.error` line if missing).

`apps/web`:
- `lib/auth-client.ts` (sign in by email or username, first-parent sign-up, `/api/me`, sign-out with a
  JSON body), `lib/clipboard.ts` (copy that works on plain HTTP), `api.ts` sends a 401 to `/sign-in`.
- `/sign-in` (first run: create the parent account) and `/join/<token>` (join: username + password;
  reset: new password; dead links explained).
- `SessionGate requiredRole=…` on the parent shell and on the new `/child` area.
- Settings → Children, on each card, **Login**: `none · Create invite link` → the link with Copy and
  its expiry (shown once); `@ivy · Reset password link · Remove login` (two-step confirm).
- Signed-in name + **Sign out** in both sidebars; the child area is a top bar with tabs on a phone.
- **Placeholder cards** (`ComingSoonCard`: stage badge, one line, disabled action, no fake data):
  child **Homework** tab — *My homework* (2), *Add homework* (2), *Start from a screenshot* (3), plus a
  live profile card; child **Solutions** tab — *Hand in your work* (4), *Feedback from your parent*
  (4); parent **Review** tab — a live "child logins are ready" card, *Homework the children entered*
  (2), *Screenshots* (3), *Waiting for your review* (4).

`deploy/`: `BETTER_AUTH_SECRET` from `homework-secrets`, `BETTER_AUTH_URL`, `COOKIE_DOMAIN:
.arch.internal`; `create-cluster-secret.sh` refuses an env file missing a required key;
`compose.yaml` and `.env.example` get local values.

Docs: ADR 0004, `docs/architecture.md`, knowledge entry `better-auth-parent-child`.

## Exit criteria

- [x] **Access matrix** (DB-free, every route the app registers, probed through `authorize` on a stub
  so no real handler runs): no session → 401; child → 403 on every parent route; parent → 403 on
  `/api/child/*`; public paths open; a throwing session lookup → 401.
- [x] **Auth flows** on live Postgres through the real Better Auth session path: first sign-up →
  parent, second → 403; invite → preview → accept → child signs in by username (case-insensitive)
  → `/api/me` + own profile, 403 on parent routes incl. the TeacherEase password; a child cannot set
  `role`/`childId` through `update-user`; used / expired / cancelled / unknown links refused; two
  simultaneous accepts → one login; a taken username releases the link for a retry; reset link
  changes the password and ends sessions; remove login keeps the profile; deleting the profile
  removes the login; the DB refuses a child login with no profile; sign-out ends the session.
- [x] `pnpm lint` · `pnpm typecheck` · `pnpm test:fast` (shared 88 · api 95 · web 12) · `pnpm build`;
  full api suite on Postgres 120 passed | 1 skipped (EMAIL_LIVE-gated).
- [x] **Prod images under compose, in a real browser** (Playwright): `/` → first-run form → parent
  account → Today with the Review tab and account footer → Settings → Children → Create invite
  link (shown once, 7-day expiry) → sign out → the link → "Hi Ivy!" → username + password → `/child`
  with the live profile and stage 2–3 placeholders → `/settings/children` sends the child back to
  `/child` → from the child's session the API answers 403 for children, the TeacherEase password,
  settings and digest, 200 for their own profile → phone width: top bar + tabs → wrong password shows
  an error → parent signs in by email → reset link: preview, accept, reuse 410, old password 401, new
  200, parent session untouched → Remove login (two-step) → card back to "none", the child's sign-in
  401, profile kept.
- [x] Logs: every api line JSON (117 in the run), no password or token anywhere, invite paths logged
  as `:token`, wrong passwords at `warn`; browser console errors are only the expected 401/403/410s.
- [x] Nothing else regressed: a real cron tick ran with its `job`/`run_id`; SIGTERM still drains.
- [ ] *(cluster)* Secret patched, released via CI → arch-infra → Argo, migration applied; from the
  LAN the API answers 401 without a session and the sign-in page offers the first-run form.
- [ ] *(cluster, you)* Create the parent account, an invite link for your daughter, and review both
  sides.

## Decisions

- ADR 0004 in full, including the one deviation from the siblings: no Better Auth `admin` plugin.
- **"Child" everywhere** (user instruction, 2026-09-29) — role, paths, code, copy, docs.
- **Web auth client hand-written** (homeparentcontrol), not Better Auth's React client.
- **Parent signs in by email, child by username**; the sign-in form takes either.
- **The parent can still reveal the TeacherEase password** (it is theirs); write-only is deferred.
- **Placeholders are UI only** — no API or tables for stages 2–4 yet.
- Defaults from the stage plan: home network only; any number of child logins, one per child profile.

## Progress

- 2026-09-29: built API, web and deploy wiring; unified the wording on "child" across code, API paths
  (`/api/child/*`, `/child`), role value, copy and docs on request. Verified locally end to end (see
  exit criteria). Found and fixed on the way: the request log would have written invite tokens into
  Loki (now masked + tested); Better Auth logs a wrong password at `error` (now `warn`); the admin
  plugin cannot take custom role names without an access-control policy (dropped, ADR 0004); the
  child's phone header showed a stray rule (fixed, re-checked on the rebuilt image).

## References

- Stage plan (temp doc): https://claude.ai/code/artifact/186491e4-eaec-46e3-9817-d01f96988b20
- [ADR 0004](../adr/0004-accounts-and-roles.md); homeparentcontrol `auth.ts`, `middleware/auth.ts`,
  `signup-gate.ts`, `rate-limit.ts`, `lib/auth-client.ts`, `lib/clipboard.ts`; homecal
  `docs/lessons.md`
- Depends on: M08 (logging) — Better Auth's logger uses the house log shape
