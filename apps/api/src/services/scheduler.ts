// In-process scheduler. Replaces the desktop app's Rust wall-clock scheduler
// with a node-cron singleton (homenews house pattern). Arms one cron task per
// fetch slot and per notify slot, computed from the fetch.*/notify.* cadence
// settings. The suspend/catch-up machinery is intentionally dropped — a k3s pod
// runs continuously, so plain cron suffices.

import { randomUUID } from "node:crypto";
import { computeSlots, slotToCron } from "@homework/shared";
import { type ScheduledTask, schedule } from "node-cron";
import { config } from "../config.js";
import type { Database } from "../db/index.js";
import { getChildren, getSetting } from "../db/queries.js";
import { runFetch } from "../fetch/run-fetch.js";
import { log, withLogContext } from "../lib/logger.js";
import { buildDigestFromDb, renderDigestEmail } from "./digest.js";
import { type EmailContent, loadSmtpConfig, type SmtpConfig, sendEmail } from "./email.js";

// Module-level singleton — only one scheduler arms at a time.
let tasks: ScheduledTask[] = [];
// Runs currently executing, so a SIGTERM can wait for them (drainScheduler).
const inFlight = new Set<Promise<void>>();

// --- Cycles (exported for the /digest routes + tests) ---------------------

export interface CycleDeps {
  readonly runFetchImpl?: (childId: string) => Promise<unknown>;
  readonly sendEmailImpl?: (cfg: SmtpConfig, content: EmailContent) => Promise<void>;
  readonly now?: () => Date;
}

/** Fetch every child. Errors are logged per child and never abort the cycle. */
export async function runFetchCycle(db: Database, deps: CycleDeps = {}): Promise<void> {
  const doFetch = deps.runFetchImpl ?? ((id: string) => runFetch(id));
  const startedAt = Date.now();
  const children = await getChildren(db);
  log.info({ event: "scheduler.fetch.start", child_count: children.length }, "fetch cycle started");
  for (const child of children) {
    try {
      await doFetch(child.id);
    } catch (err) {
      log.error(
        { event: "scheduler.fetch.child_failed", child_id: child.id, err },
        "child fetch failed",
      );
    }
  }
  log.info(
    {
      event: "scheduler.fetch.done",
      child_count: children.length,
      duration_ms: Date.now() - startedAt,
    },
    "fetch cycle finished",
  );
}

/**
 * Build + send the digest. If notify.fetchBeforeDispatch is set, fetch first so
 * the digest reflects fresh portal state. Sends only when the email channel is
 * enabled (notify.refreshDigest.email) AND SMTP is configured. Returns whether
 * an email was sent.
 */
export async function runNotifyCycle(
  db: Database,
  deps: CycleDeps = {},
): Promise<{ sent: boolean }> {
  const now = deps.now ? deps.now() : new Date();
  const fetchBefore = (await getSetting(db, "notify.fetchBeforeDispatch")) === "1";
  if (fetchBefore) {
    await runFetchCycle(db, deps);
  }

  const digest = await buildDigestFromDb(db, now);

  const emailEnabled = (await getSetting(db, "notify.refreshDigest.email")) === "1";
  if (!emailEnabled) {
    log.info({ event: "scheduler.notify.skip", reason: "email_disabled" }, "digest not sent");
    return { sent: false };
  }
  const cfg = await loadSmtpConfig(db);
  if (!cfg) {
    log.info({ event: "scheduler.notify.skip", reason: "smtp_unconfigured" }, "digest not sent");
    return { sent: false };
  }

  const rendered = renderDigestEmail(digest);
  const content: EmailContent = {
    subject: rendered.subject,
    text: rendered.textBody,
    html: rendered.htmlBody,
  };
  const doSend = deps.sendEmailImpl ?? sendEmail;
  await doSend(cfg, content);
  log.info({ event: "scheduler.notify.sent", child_count: digest.children.length }, "digest sent");
  return { sent: true };
}

// --- Arming ----------------------------------------------------------------

/**
 * Run one scheduled job body the way a cron tick does. ★ Every line the run
 * logs — its own, runFetch's, the digest's — carries `{ job, run_id }`, so one
 * run can be pulled up whole in Loki. A failure is one `error` line; the run is
 * tracked until it settles so `drainScheduler` can wait for it.
 */
export function runJob(job: string, run: () => Promise<void>): Promise<void> {
  const tick = withLogContext({ job, run_id: randomUUID() }, async () => {
    try {
      await run();
    } catch (err) {
      log.error({ event: "scheduler.tick.failed", err }, "scheduled run failed");
    }
  });
  inFlight.add(tick);
  void tick.finally(() => inFlight.delete(tick));
  return tick;
}

interface Cadence {
  runsPerDay: number;
  firstSlotAt: string;
  weekdaysOnly: boolean;
}

async function loadCadence(db: Database, prefix: "fetch" | "notify"): Promise<Cadence> {
  const runsPerDay = Number.parseInt((await getSetting(db, `${prefix}.runsPerDay`)) ?? "1", 10);
  const firstSlotAt = (await getSetting(db, `${prefix}.firstSlotAt`)) ?? "08:00";
  const weekdaysOnly = (await getSetting(db, `${prefix}.weekdaysOnly`)) === "1";
  return {
    runsPerDay: Number.isFinite(runsPerDay) ? runsPerDay : 1,
    firstSlotAt,
    weekdaysOnly,
  };
}

function armCadence(cadence: Cadence, run: () => Promise<void>, job: string): ScheduledTask[] {
  const slots = computeSlots(cadence.runsPerDay, cadence.firstSlotAt);
  return slots.map((minute) => {
    const expr = slotToCron(minute, cadence.weekdaysOnly);
    log.info({ event: "scheduler.arm", job, cron: expr, tz: config.tz }, "cron slot armed");
    return schedule(expr, () => void runJob(job, run), { timezone: config.tz });
  });
}

/** Arm the fetch + notify cron tasks from settings. Safe to call again — it
 *  stops existing tasks first (so a settings change can re-arm). */
export async function startScheduler(db: Database): Promise<void> {
  stopScheduler();
  const fetchCadence = await loadCadence(db, "fetch");
  const notifyCadence = await loadCadence(db, "notify");
  tasks = [
    ...armCadence(fetchCadence, () => runFetchCycle(db), "fetch"),
    ...armCadence(
      notifyCadence,
      async () => {
        await runNotifyCycle(db);
      },
      "notify",
    ),
  ];
  log.info({ event: "scheduler.started", task_count: tasks.length }, "scheduler started");
}

/** Stop and clear all armed tasks. Safe to call when nothing is armed. */
export function stopScheduler(): void {
  for (const t of tasks) {
    void t.stop();
  }
  if (tasks.length > 0) {
    log.info({ event: "scheduler.stopped", task_count: tasks.length }, "scheduler stopped");
  }
  tasks = [];
}

/**
 * Stop arming new runs, then wait for any run already in flight — so a SIGTERM
 * does not cut a fetch off halfway through persisting. Gives up after
 * `timeoutMs`; fetches upsert, so the next slot redoes the work.
 */
export async function drainScheduler(timeoutMs: number): Promise<void> {
  stopScheduler();
  if (inFlight.size === 0) return;
  let timer: NodeJS.Timeout | undefined;
  const timedOut = await Promise.race([
    Promise.allSettled([...inFlight]).then(() => false),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(true), timeoutMs);
    }),
  ]);
  clearTimeout(timer);
  if (timedOut) {
    log.warn(
      { event: "scheduler.drain_timeout", in_flight: inFlight.size },
      "gave up waiting for in-flight runs",
    );
  }
}
