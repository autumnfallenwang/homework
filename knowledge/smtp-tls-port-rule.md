---
name: smtp-tls-port-rule
description: nodemailer transport uses secure:true only on port 465 (implicit TLS), secure:false otherwise (STARTTLS) — the exact rule ported from the desktop lettre sender. SMTP config comes from the settings table, not env.
metadata:
  type: feedback
---

The email sender (`apps/api/src/services/email.ts`, nodemailer, replacing the desktop Rust
`lettre`) decides TLS purely by port: **`secure: cfg.port === 465`** (implicit TLS on 465,
STARTTLS otherwise). This is 1:1 with the source's `port == 465 ? relay : starttls_relay`.

Other settled details:
- **SMTP config is read from the `settings` table** (`smtp.host/port/username/from/to/password`)
  via `loadSmtpConfig(db)`, which returns `null` if any required field is missing/invalid — NOT
  from env vars or Sealed Secrets (homecal uses env; we intentionally diverge to stay 1:1 with the
  desktop's user-configured Settings, plaintext per the locked credentials decision).
- **Recipients**: `smtp.to` is comma-separated → split/trim/drop-empties → array passed to
  `sendMail` (`parseRecipients`). Throws if none.
- Email is multipart text + HTML (`renderDigestEmail` → `{ subject, textBody, htmlBody }`),
  rendered **English-only** (the desktop i18n layer was not ported server-side).
- Live send is opt-in: `EMAIL_LIVE=1` + `SMTP_*` env, in `email.live.integration.test.ts`
  (excluded from `test:fast`, self-skips). Mirrors the scraper's `TEACHEREASE_LIVE`.
- **Mocking nodemailer in vitest:** `vi.mock("nodemailer", …)` is hoisted above top-level `const`s,
  so build the `createTransport`/`sendMail` spies inside `vi.hoisted(() => …)` — otherwise the mock
  factory throws "cannot access before initialization".

**How to apply:** don't add a `secure` setting — derive it from the port. New mail features reuse
`loadSmtpConfig` + `sendEmail`. Related: [[scheduler-nodecron-slots]], [[hono-route-conventions]].
