---
name: 05-scheduler-email
status: done
created: 2026-05-30
---

# Milestone 05 — Scheduler & email digests

Replace the desktop app's two big platform-bound pieces — the Rust wall-clock scheduler and the Rust `lettre` SMTP sender — with server-side equivalents. In a long-running k3s pod, scheduling is far simpler than it was on a sleep-prone laptop: a cron singleton replaces all the wall-clock/suspend-recovery machinery.

## Goal

The API, running in-cluster, automatically fetches grades and sends email digests on the configured cadence (N times/day, first-slot time, optional weekday-only), with no user interaction. "Send digest now" works on demand.

## Scope / deliverables

`apps/api/src/services/scheduler.ts` — a **node-cron singleton** (homenews/homecal pattern):
- Reads cadence from settings (`fetch.*`, `notify.*` keys)
- Fetch job: runs `runFetch()` for every child on the fetch cadence
- Notify job: builds + sends the digest on the notify cadence; if `notify.fetchBeforeDispatch=1`, runs a fetch first
- Honors `weekdaysOnly`; recomputes slot times from `runsPerDay` + `firstSlotAt`
- Singleton guard so only one scheduler runs (Deployment uses `Recreate` strategy, replicas=1 — set in M07)

`apps/api/src/services/email.ts` — **nodemailer** SMTP transport:
- Reads `smtp.*` settings; port 465 → implicit TLS, else STARTTLS (matches the lettre logic)
- Multipart text + HTML; comma-separated `to` parsing with per-recipient validation

`apps/api/src/services/digest.ts` — port `buildRefreshDigest()` + `renderDigestEmail()`:
- Per child: hero counts, attention items (via shared attention engine from M04), homework-for-today + due-today, fetch failures
- Output `{ subject, textBody, htmlBody }`

Routes (extend M04): `POST /digest/send` (send now), `POST /digest/test` (test email to configured `to`).

## Exit criteria

- [ ] Scheduler computes correct fire times from `runsPerDay` + `firstSlotAt` + `weekdaysOnly` (unit-tested with a fixed clock)
- [ ] Fetch job runs `runFetch` for all children on cadence; notify job composes + sends a digest
- [ ] `POST /digest/test` sends a real email through a configured SMTP server (gated/opt-in, like the source's `EMAIL_LIVE=1`)
- [ ] Digest content matches the desktop app: attention items sorted (missing first), homework sections, failure notices
- [ ] Only one scheduler instance runs; restarting the pod re-arms cleanly with no duplicate sends

## Decisions (locked)

- **Drop the wall-clock/suspend-recovery scheduler entirely.** That complexity (NAP_CAP, MISS_THRESHOLD, catch-up-on-miss, `scheduler:notify-missed` events) existed only because a laptop sleeps. A k3s pod runs continuously, so a plain **node-cron** schedule suffices. `notify.catchupOnMiss` becomes a no-op/removed setting.
- **nodemailer** replaces Rust `lettre` (same TLS logic, Node-native).
- **No OS notifications** — `notify.refreshDigest.os` is dropped (feature cut, see M06). Email is the only digest channel.
- **Scheduler runs inside the API process** (homenews/homecal both do this) — no separate worker Deployment or k8s CronJob. Simpler; one image.

## Open questions

- **SMTP infra credentials in-cluster:** the per-account SMTP password is user-entered → stored plaintext in the `smtp.password` setting (per the locked secrets decision). But should the *default* SMTP host/from for the digest be injectable via a k8s Secret/env as a fallback, or is it always user-configured through Settings like the desktop app? *(Recommend: always user-configured via Settings — true 1:1. No special-casing.)*
- **Timezone:** cron fires in the pod's TZ. The cluster pods — what timezone? The digest "today"/slot times must match the family's local time. **Need to confirm the cluster timezone (or set `TZ` env on the api Deployment).** Likely America/* — confirm in M07.

## References

- Source scheduler: `teacherease-parent-companion/src-tauri/src/scheduler.rs` (the complexity we're deleting)
- Source SMTP: `src-tauri/src/smtp.rs`; digest: `src/lib/notify/digest.ts`, `email-templates.ts`, `email-channel.ts`
- Cron blueprint: `homenews/apps/api/src/services/scheduler.ts`, `homecal/apps/api/src/services/reminder-scheduler.ts`
- Email blueprint: `homecal/apps/api/src/services/email.ts`
- Depends on: M03 (`runFetch`), M04 (attention engine in shared)

## Progress

- **`packages/shared/src/schedule.ts`** — pure slot math ported from the desktop
  `schedule/{fetch,notify}-schedule.ts`: `computeSlots(runsPerDay, firstSlotAt)` (clamp 1–8, spread
  `1440/n` from the anchor) + `slotToCron(minute, weekdaysOnly)`. Unit-tested (12 cases).
- **`apps/api/src/services/email.ts`** — nodemailer transport replacing Rust `lettre`. TLS 1:1 with
  source (`secure: port === 465`, else STARTTLS); `loadSmtpConfig(db)` reads `smtp.*` settings;
  comma-separated recipients parsed/trimmed. Unit-tested via mocked nodemailer + an
  `EMAIL_LIVE=1`-gated real-send test (`email.live.integration.test.ts`).
- **`apps/api/src/services/digest.ts`** — `buildRefreshDigest` (pure, ported, uses shared
  `computeChildAttention`/`sortItemsMissingFirst`), `buildDigestFromDb` (assembles per-child inputs
  from queries), and `renderDigestEmail` (text+HTML, ported from `email-templates.ts` with English
  strings inlined — i18n dropped server-side). Failures dropped per source D-18.
- **`apps/api/src/services/scheduler.ts`** — node-cron singleton (homenews pattern). `runFetchCycle`
  (runFetch per child) + `runNotifyCycle` (fetch-before-dispatch, build digest, send when
  `notify.refreshDigest.email=1` and SMTP configured), both with injectable deps for tests.
  `startScheduler` arms one cron task per fetch + notify slot with `timezone: config.tz`;
  `stopScheduler` re-arm-safe.
- **Routes** `apps/api/src/routes/digest.ts` (`POST /digest/send`, `POST /digest/test`) mounted at
  `/api/digest`. **Wiring**: `config.tz` (`TZ` env, default `America/New_York`);
  `startScheduler(db)` called from `index.ts` after seed (skipped under `NODE_ENV=test`);
  `getHomeworkDueOnDay` added to queries. Deps added: `node-cron@^4`, `nodemailer@^8`,
  `@types/nodemailer` (node-cron ships its own types).

## Outcome

Shipped the scheduler + email digest server-side. Decisions: **TZ = America/New_York** (via `TZ`
env / `config.tz`, also passed to node-cron). DB timestamps stay **UTC**; TZ-aware display is a
web/UI concern (M06). The M07 Deployment must set `TZ=America/New_York` on the pod so Node's local
`Date` (used by the digest's "today") and node-cron agree. **Email rendered English-only** (i18n
stays a web concern). Suspend/catch-up machinery and OS notifications dropped per locked decisions.

Check loop **all green**: lint · typecheck · `test:fast` (shared 88 + api 62) · build, plus full
live-Postgres suite (**16 files / 82 passed | 3 skipped** — skips are the `EMAIL_LIVE`-gated live
sends). Live smoke confirmed: boot armed **5 cron tasks** (fetch 09:00/17:00/01:00, notify
08:00/20:00, all America/New_York); `POST /api/digest/test` → 400 `{"error":"SMTP not configured"}`;
`POST /api/digest/send` → `200 {"sent":false}` (email disabled). Scheduler integration test verified
fetch-before-dispatch ordering and the enable/configure send gate with an injected transport.

**Run the live email test:** set `SMTP_*` in `apps/api/.env`, then
`EMAIL_LIVE=1 pnpm --filter @homework/api exec vitest run email.live`.

> Note: the project's secrets hook blocks writing to `.env`, so for local scheduler verification
> pass `TZ=America/New_York` inline on the dev command; `config.tz` defaults to it regardless.
