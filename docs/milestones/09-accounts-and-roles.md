---
name: 09-accounts-and-roles
status: done
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

Account self-service (review feedback, 2026-09-30) — the common pattern (GitHub, Linear, Notion):
an **Account** page inside Settings, and the signed-in name in every sidebar links to it.
- Parent: Settings → **Account** (first tab): rename yourself, see your sign-in email and role,
  change password. The Settings sidebar gets the account footer too.
- Child: **Settings** works exactly like the parent's (review round 2): the SAME `SettingsSidebar`
  replaces the main navigation (Back → `/child`) and the SAME `SettingsView` renders
  `/child/settings/[tab]`, limited to **Account** (name, username and role read-only — the name
  belongs to the child profile; change password) and **Appearance** (kept per browser). Reached
  from a sidebar item on desktop, a third tab on a phone. Below tablet width the settings sidebar
  (both roles) is an icon rail.
- Sidebar footer is the same for both roles: name, then role ("Aaron · Parent", "Ivy · Child").
- Password changes use Better Auth's `change-password` (current password checked, every OTHER
  session revoked, this one kept); the parent's rename uses `update-user`.
- The theme provider moved from the role-gated layouts to the root layout: no light flash while
  the session loads, and `/sign-in` / `/join` follow the appearance preference.

`deploy/`: `BETTER_AUTH_SECRET` from `homework-secrets`, `BETTER_AUTH_URL`, `COOKIE_DOMAIN:
.arch.internal`; `create-cluster-secret.sh` refuses an env file missing a required key;
`compose.yaml` and `.env.example` get local values.

Docs: ADR 0004, `docs/architecture.md`, knowledge entry `better-auth-parent-child`.

### Review round 3 — one account shape, email only ([ADR 0005](../adr/0005-email-sign-in-for-everyone.md))

Plan (2026-09-30), replacing the per-role sign-in:
1. **Everyone signs in with email + password**; the first-run parent gives name, email, password; a
   child's invite asks for email + password (their name comes from the profile).
2. **Remove usernames**: drop Better Auth's `username` plugin and the `username` /
   `display_username` columns; no placeholder emails.
3. **Same Account page for both roles**: Name (a child's is locked — it follows their profile one
   way), Email (each person changes their own; unique), Role, Password. `PATCH /api/me` is the one
   self-service door; Better Auth's `update-user` / `change-email` are closed.
4. **Child cards** show the login's email; **reset links** preview the login's email.
5. **Parent recovery command** in the api pod: prints a one-time new password.
6. **Migration `0002`**: delete logins with a placeholder email (the child login made under ADR 0004 —
   profile and history untouched; re-invite), then drop the username columns.
7. Tests (unit, live Postgres incl. the migration on a copy of the prod shape), prod images in a
   real browser for both roles, deploy, verify live; docs + knowledge.

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
- [x] **Account self-service** — integration: a parent renames themselves (`/api/me` reflects it); a
  child changes their password with the wrong current one (refused) and the right one (200), the
  other device's session → 401, this one stays, old password 401, new 200. Browser on the prod
  images: footer "Aaron / Parent" and "Ivy / Child", each opening its own Account page; parent
  rename updates the footer at once; wrong / right current password; child Account + Appearance
  (dark persists across reloads, applies on `/sign-in` too); phone layout with the Settings tab.
- [x] *(cluster)* `BETTER_AUTH_SECRET` added to the live `homework-secrets` (generated in place, never
  printed; the other keys untouched); released `af920e9` via CI (`36658318234`) → arch-infra → Argo;
  the migrate hook applied `0001` (tables `users`…`invites`, 0 users); from the LAN every API route
  answers 401 without a session, `setup-state` says first run, CORS allows the web origin with
  credentials, all web routes serve, existing data intact (1 child profile, 638 fetch runs, 753
  homework rows); the new pod's lines in Loki are all JSON. The exact prod image run with the
  cluster's `COOKIE_DOMAIN`/`BETTER_AUTH_URL` issues the session cookie as
  `Domain=.arch.internal; HttpOnly; SameSite=Lax` (7 days, no `Secure` — right for plain HTTP).
- [x] **Round 3 — email only (ADR 0005):** live Postgres: first sign-up → parent; invite join needs an
  email (400 without), an email another login uses → 409 and the link survives for a retry; sign-in
  by email is case-insensitive; `update-user` / `change-email` → 404; `PATCH /api/me`: parent renames
  + changes email (old email then 401, new 200), a child's name → 403, email taken → 409, bad email →
  400; renaming the profile renames the child login; reset link previews the login's email.
  **Migration 0002 on a prod-shaped copy** (built with the deployed image, seeded like prod): the
  placeholder-email child login + its password and session removed; the parent login, password and
  session kept; profile, fetch runs and invite history untouched; username columns dropped.
  **Recovery command** in the new image: case-insensitive email, one-time password printed once
  (logged only as an event), unknown email → exit 1; the parent then signs in with it. **Browser on
  the prod images**: sign-in page asks Email + password; child card "Login: none" after the
  migration → new invite → join with an email in use (error) → own email (in) → child Account: name
  locked, email editable → changed email signs in, old one does not; parent Account shows the same
  layout; the parent's card shows the child's new email.
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

- 2026-09-30 (review round 3): usernames dropped — email is the only sign-in for both roles (ADR
  0005); one Account page (Name, Email, Role, Password; a child's name locked, following the
  profile); `PATCH /api/me` is the one self-service door; parent recovery command; migration 0002
  removes placeholder-email child logins (re-invite) and the username columns.
- 2026-09-30 (review round 2): child Settings reuse the parent's settings sidebar and view instead
  of a separate top-tab header; the settings sidebar takes its tab list, base path and Back target
  as props and becomes an icon rail on phones.
- 2026-09-30 (review round 1): Account page in Settings + footer link for both roles, child
  Settings (Account, Appearance), consistent footer (name · role), theme provider moved to the root
  layout (fixed a dark-mode flash introduced with the session gate). Remaining, pre-existing: a
  brief light flash before any JavaScript runs — fixable with an inline `<head>` script
  (next-themes style); not done here.
- 2026-09-30: released to the cluster and verified (see exit criteria); the parent account is
  deliberately left unclaimed for you. Before re-running `scripts/create-cluster-secret.sh`, copy
  the live `BETTER_AUTH_SECRET` into your local `cluster-secrets.env` (the script now refuses a file
  without it; changing the value signs everyone out).

## References

- Stage plan (temp doc): https://claude.ai/code/artifact/186491e4-eaec-46e3-9817-d01f96988b20
- [ADR 0004](../adr/0004-accounts-and-roles.md); homeparentcontrol `auth.ts`, `middleware/auth.ts`,
  `signup-gate.ts`, `rate-limit.ts`, `lib/auth-client.ts`, `lib/clipboard.ts`; homecal
  `docs/lessons.md`
- Depends on: M08 (logging) — Better Auth's logger uses the house log shape
