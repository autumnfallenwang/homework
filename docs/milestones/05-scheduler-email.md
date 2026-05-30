---
name: 05-scheduler-email
status: todo
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
