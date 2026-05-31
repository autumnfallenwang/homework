// In-process scheduler. Replaces the desktop app's Rust wall-clock scheduler
// with a node-cron singleton (homenews house pattern). Arms one cron task per
// fetch slot and per notify slot, computed from the fetch.*/notify.* cadence
// settings. The suspend/catch-up machinery is intentionally dropped — a k3s pod
// runs continuously, so plain cron suffices.

import { computeSlots, slotToCron } from "@homework/shared";
import { type ScheduledTask, schedule } from "node-cron";
import { config } from "../config.js";
import type { Database } from "../db/index.js";
import { getChildren, getSetting } from "../db/queries.js";
import { runFetch } from "../fetch/run-fetch.js";
import { log as logger } from "../lib/logger.js";
import { buildDigestFromDb, renderDigestEmail } from "./digest.js";
import { type EmailContent, loadSmtpConfig, type SmtpConfig, sendEmail } from "./email.js";

// Module-level singleton — only one scheduler arms at a time.
let tasks: ScheduledTask[] = [];

function log(event: string, extra: Record<string, unknown> = {}): void {
  logger.info({ event, ...extra });
}

function logErr(event: string, extra: Record<string, unknown> = {}): void {
  logger.error({ event, ...extra });
}

// --- Cycles (exported for the /digest routes + tests) ---------------------

export interface CycleDeps {
  readonly runFetchImpl?: (childId: string) => Promise<unknown>;
  readonly sendEmailImpl?: (cfg: SmtpConfig, content: EmailContent) => Promise<void>;
  readonly now?: () => Date;
}

/** Fetch every child. Errors are logged per child and never abort the cycle. */
export async function runFetchCycle(db: Database, deps: CycleDeps = {}): Promise<void> {
  const doFetch = deps.runFetchImpl ?? ((id: string) => runFetch(id));
  const children = await getChildren(db);
  log("scheduler.fetch.start", { children: children.length });
  for (const child of children) {
    try {
      await doFetch(child.id);
    } catch (err) {
      logErr("scheduler.fetch.child_failed", {
        childId: child.id,
        msg: err instanceof Error ? err.message : String(err),
      });
    }
  }
  log("scheduler.fetch.done");
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
    log("scheduler.notify.skip", { reason: "email_disabled" });
    return { sent: false };
  }
  const cfg = await loadSmtpConfig(db);
  if (!cfg) {
    log("scheduler.notify.skip", { reason: "smtp_unconfigured" });
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
  log("scheduler.notify.sent", { children: digest.children.length });
  return { sent: true };
}

// --- Arming ----------------------------------------------------------------

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

function armCadence(cadence: Cadence, run: () => Promise<void>, label: string): ScheduledTask[] {
  const slots = computeSlots(cadence.runsPerDay, cadence.firstSlotAt);
  return slots.map((minute) => {
    const expr = slotToCron(minute, cadence.weekdaysOnly);
    log("scheduler.arm", { label, cron: expr, tz: config.tz });
    return schedule(
      expr,
      () => {
        run().catch((err) =>
          logErr("scheduler.tick.failed", {
            label,
            msg: err instanceof Error ? err.message : String(err),
          }),
        );
      },
      { timezone: config.tz },
    );
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
  log("scheduler.started", { tasks: tasks.length });
}

/** Stop and clear all armed tasks. Safe to call when nothing is armed. */
export function stopScheduler(): void {
  for (const t of tasks) {
    void t.stop();
  }
  if (tasks.length > 0) log("scheduler.stopped", { tasks: tasks.length });
  tasks = [];
}
