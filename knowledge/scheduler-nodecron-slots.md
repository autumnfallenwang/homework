---
name: scheduler-nodecron-slots
description: The in-process scheduler arms one node-cron task per slot (computed by shared computeSlots → slotToCron), passes timezone:config.tz, and is a module-level singleton skipped under NODE_ENV=test.
metadata:
  type: feedback
---

M05's scheduler (`apps/api/src/services/scheduler.ts`) follows the homenews node-cron pattern,
adapted to the desktop app's slot model:

- **Slot math is pure + in shared** (`packages/shared/src/schedule.ts`): `computeSlots(runsPerDay,
  firstSlotAt)` spreads N fire times `1440/n` apart from the anchor (clamped 1–8);
  `slotToCron(minute, weekdaysOnly)` → `"M H * * *"` / `"M H * * 1-5"`. Unit-tested without cron.
- **One cron task per slot.** `startScheduler` computes fetch + notify slots and arms a
  `cron.schedule(expr, cb, { timezone: config.tz })` per slot. Module-level `tasks: ScheduledTask[]`
  is the singleton; `startScheduler` calls `stopScheduler` first so it's re-arm-safe on a settings
  change. `stopScheduler` is safe when nothing is armed.
- **Timezone:** `config.tz` = `process.env.TZ ?? "America/New_York"`. Pass it to node-cron's
  `timezone` option AND ensure the pod's `TZ` env is set — Node uses `TZ` (not config.tz) for local
  `Date` math, which the digest's "today" (`toLocalIso(now)`) relies on. If cron's tz and the
  process tz disagree, the digest date can be off near midnight. DB timestamps stay UTC; TZ-aware
  display is a web/UI concern. **M07 Deployment must set `TZ=America/New_York`.**
- **Started from `index.ts`** after `seedSettings`, guarded `if (process.env.NODE_ENV !== "test")`
  so tests never arm real cron. Cycles (`runFetchCycle`, `runNotifyCycle`) take injectable deps
  (`runFetchImpl`/`sendEmailImpl`/`now`) so integration tests exercise them with no scraping/SMTP.

**Why:** a k3s pod runs continuously, so the desktop's wall-clock/suspend/catch-up machinery was
dropped — plain cron suffices. `notify.catchupOnMiss` is now a no-op setting.

**Gotcha:** node-cron v4 **ships its own types** — do NOT add `@types/node-cron` (it's a stale v3
stub). **How to apply:** add new periodic jobs as more slots/tasks in `startScheduler`; keep slot
math pure in shared. Related: [[hono-route-conventions]], [[smtp-tls-port-rule]].
