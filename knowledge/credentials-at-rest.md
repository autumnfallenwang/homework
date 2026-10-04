---
name: credentials-at-rest
description: ADR 0010 / M12 — TeacherEase + SMTP passwords stored as enc:v1:… (AES-256-GCM, key = HKDF of BETTER_AUTH_SECRET); seal/open only inside the query helpers; boot seals leftovers and logs credentials.ready; unseal script before rollback or secret rotation.
metadata:
  type: feedback
---

Credentials at rest live in `apps/api/src/lib/credentials.ts` (`sealCredential` / `openCredential`,
`CREDENTIAL_SETTING_KEYS = {"smtp.password"}`) and `services/credentials.ts` (boot seal + check,
unseal).

**Why:** the portal and SMTP passwords were plaintext in Postgres since the port; a dump or the
node's volume exposed them.

**How to apply:**
- Never write `children.portal_password` or a credential setting directly — go through
  `addChild` / `updateChildPassword` / `setSetting` (they seal); read through `getChildPassword` /
  `getSetting` / the fetch's lookup (they open). A new credential setting key goes into
  `CREDENTIAL_SETTING_KEYS`.
- Every API boot logs `credentials.ready {sealed_now, stored, unreadable}`; `unreadable > 0` is an
  `error` line = the key changed (BETTER_AUTH_SECRET rotated) or a value is damaged.
- Before rotating BETTER_AUTH_SECRET or running an image older than M12:
  `kubectl -n homework exec deploy/homework-api -- node --import tsx src/scripts/unseal-credentials.ts`.
  Locally the script needs the same secret the API uses (`BETTER_AUTH_SECRET=… node --env-file=.env
  --import tsx …`).
- The children-settings Save validates the login against the real TeacherEase site — don't click it
  with fake dev logins; drive `PATCH /api/children/:id` instead.

Related: [[better-auth-parent-child]], [[logging-pino-loki]].
