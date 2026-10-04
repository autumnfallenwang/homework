# 0010 — TeacherEase and SMTP passwords are encrypted at rest

- **Status:** accepted
- **Date:** 2026-10-04
- **Deciders:** project founder

## Context

Since the port (M02) the TeacherEase portal password of each child profile
(`children.portal_password`) and the SMTP password (`settings` "smtp.password") have been
stored as plaintext in Postgres — the overview's "deferred to a future milestone", ADR 0004's
"encrypting portal/SMTP passwords at rest remain deferred", the architecture's last open
question. M09 put them behind the parent login, but anyone with a database dump, the volume on
the node, or `psql` in the db pod could read them. The founder picked this as the one deferred
piece that matters (2026-10-04).

## Decision

**AES-256-GCM, sealed in the API.** Both values are stored as
`enc:v1:<base64(iv | tag | ciphertext)>` (12-byte random IV, 16-byte tag). `lib/credentials.ts`
seals on write and opens on read inside the existing helpers (`addChild`,
`updateChildPassword`, `getChildPassword`, `getSetting` / `setSetting` for credential keys, the
fetch's password lookup), so routes, the scraper, the mailer and the web are unchanged. Empty
stays empty; a value without the prefix reads as plaintext.

**The key comes from BETTER_AUTH_SECRET**, through HKDF-SHA256 with its own salt and label
("credentials at rest v1"). It lives only in the cluster Secret and the API's memory, never in
the database, and the release needs no new secret or chart change.

**Every boot seals what is left and checks the rest.** `services/credentials.ts` seals any
plaintext credential (the existing ones on the first boot of this release; idempotent after),
then tries to open every stored one, and logs one line: `credentials.ready` with `sealed_now`,
`stored`, `unreadable` — at `error` if any cannot be opened (a changed secret, damage).

**Rollback** to an image from before this ADR, or rotating BETTER_AUTH_SECRET:
`src/scripts/unseal-credentials.ts` in the api pod writes them back as plaintext first; the next
boot of a current image seals them again.

Considered and rejected:
- *A dedicated `CREDENTIALS_KEY` secret*: cleaner key separation, but a new cluster Secret key,
  a chart change and a pod that cannot start if they drift. HKDF gives a separate key from the
  existing secret; a dedicated one can replace it later behind the `v1` prefix.
- *Postgres `pgcrypto`*: the key would travel in every query and show up in statement logs.
- *Write-only portal password* (no reveal in Settings): not asked for now; the parent's reveal
  still returns the plaintext through the parent-only route.

## Consequences

**Positive:** a database dump, the node's volume or a stray `SELECT` no longer shows either
password; nothing changes for the parent, the scraper or the digest.

**Negative / risks:**
- Rotating BETTER_AUTH_SECRET without unsealing first makes the stored credentials unreadable
  (the boot line says so at `error`); the parent can type them again in Settings.
- Running an older image after this release would send `enc:v1:…` as the password until the
  unseal script runs.
- The key sits next to `DATABASE_URL` in one Secret: this protects data at rest, not a cluster
  compromise.

## Notes

- Milestone: [12 — Credentials encrypted at rest](../milestones/12-credentials-at-rest.md).
- Answers the open question in `docs/architecture.md`; amends ADR 0004's deferral.
