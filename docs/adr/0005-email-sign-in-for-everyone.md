# 0005 — Email is the only sign-in, for every role

- **Status:** accepted
- **Date:** 2026-09-30
- **Deciders:** project founder

## Context

[ADR 0004](./0004-accounts-and-roles.md) gave the two roles two different sign-ins: a parent signed
in with an email, a child with a username (Better Auth's `username` plugin), and a child's login
stored a hidden placeholder email because Better Auth requires one. In review that read as two
different kinds of account — a parent's Account page showed an email, a child's a `@username`, the
sidebar showed different things — and a child could not add an email later. A unified design with
a username for everyone was drafted and then dropped as more than a family app needs.

## Decision

**Every login is the same shape: a name, an email, a password, a role.** No usernames.

- **Register:** the first-run parent gives name, email, password. A child registers from their invite
  link with email and password; their name comes from their child profile.
- **Sign in:** one form for both roles — email + password.
- **Account page** (same layout for both roles): Name, Email, Role, Password.
  - **Email** — each person changes their own (it is their sign-in; unique across logins).
  - **Name** — a parent changes their own. A child's name belongs to their **child profile**, which
    only a parent edits: it is shown locked on the child's page and follows the profile one way
    (renaming the profile in Settings → Children renames the child's login; nothing a child does
    changes the profile).
  - **Password** — each person changes their own (current password checked; other devices signed
    out). A parent can still send a child a reset link.
- **One door for self-service:** `PATCH /api/me` (name, email) enforces those rules; Better Auth's
  own `update-user` / `change-email` routes are closed. Better Auth's `username` plugin is removed.
- **Parent recovery:** there is no email sending (LAN app), so a forgotten parent password is reset
  with a command in the api pod that prints a one-time new password.
- **Migration:** the `username` / `display_username` columns are dropped. A login whose stored email
  is a placeholder (every child login made under ADR 0004) cannot sign in any more and is removed;
  its child profile and history are untouched, and the parent sends a new invite link.

Considered: **a username for everyone** (sign in with username or email, optional email) — rejected
as extra concepts (two identifiers, placeholder emails, uniqueness of both) for no gain in a family
app; **keep the split** — rejected, it is the inconsistency this ADR removes.

## Consequences

**Positive:** one account model, one sign-in form, one Account page; no placeholder emails; a child can
change their own email.

**Trade-offs:** a child needs an email address to get a login (a parent can use one of theirs, e.g. a
`+alias`, if the child has none). The one child login created under ADR 0004 is removed and must be
re-invited. A changed email is not verified (no email sending) — acceptable on a home LAN.

## Notes

- Amends ADR 0004 (its username plugin, the per-role sign-in and placeholder emails). Everything else
  in ADR 0004 stands: parent-managed profiles, invite links, path-based enforcement, no admin plugin.
- Implemented in [milestone 09](../milestones/09-accounts-and-roles.md) (review round 3).
