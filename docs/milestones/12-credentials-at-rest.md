---
name: 12-credentials-at-rest
status: in-progress
created: 2026-10-04
---

# Milestone 12 — Credentials encrypted at rest

The TeacherEase portal passwords and the SMTP password stop being plaintext in Postgres
([ADR 0010](../adr/0010-credentials-encrypted-at-rest.md)).

## Scope / deliverables

`apps/api`:
- `lib/credentials.ts`: AES-256-GCM seal / open (`enc:v1:`), key = HKDF(BETTER_AUTH_SECRET).
- Queries seal on write and open on read (portal password, credential settings); the fetch opens
  the portal password.
- `services/credentials.ts`: boot step seals leftovers and checks every stored credential opens
  (`credentials.ready` log line); unseal for rollbacks (`scripts/unseal-credentials.ts`).

## Exit criteria

- [x] lint, typecheck, unit tests (seal/open, tamper, legacy passthrough) and live-Postgres
  integration tests (routes store sealed and return plaintext, boot seal is idempotent and
  reports unreadable values, unseal restores plaintext, the TeacherEase login gets the plaintext).
- [x] Dev end to end: the dev DB's plaintext Ivy password and SMTP password sealed on boot
  (`sealed_now` 2, `unreadable` 0, then 0 / 2 / 0 on the next boot); Settings reveal returns the
  plaintext, a changed portal password and a changed SMTP password (Settings → Notifications,
  "Save & send test email" to a local Mailpit) are stored sealed; unseal script then boot
  re-seal rehearsed.
- [ ] Released: the prod boot line shows the existing credentials sealed and none unreadable.

## Progress

- 2026-10-04: built and tested in dev (see exit criteria). The children-settings Save was not
  clicked in dev: it validates the login against the real TeacherEase site, and the dev profiles
  have fake logins — the same server routes were driven from the parent session instead.
