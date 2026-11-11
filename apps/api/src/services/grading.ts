// Homework grading (ADR 0014, M13): settings, the sweep that grades each Submit,
// the alert email, and what each side may see of a grade.
//
// The database is the queue: a Submit with no grade row is waiting. The sweep
// (every minute, services/scheduler.ts) grades settled submissions one at a time;
// failed tries are rows too, retried with a backoff, 3 at most. The parent's
// "Grade again" goes in an in-memory queue the next sweep empties first (lost on
// a restart — the parent presses it again).

import {
  type ChildPhotoCheck,
  GRADING_DEFAULTS,
  GRADING_LIMITS,
  GRADING_SETTING_KEYS,
  type GradeStatus,
  type GradingModelList,
  type GradingSettings,
  type GradingSettingsInput,
  gradeNeedsParent,
  type HomeworkGrade,
  type HomeworkGradeBrief,
  type HomeworkGradeList,
  nextGradeAttemptAt,
} from "@homework/shared";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { config } from "../config.js";
import type { Database } from "../db/index.js";
import { getSetting, setSetting } from "../db/queries.js";
import { childClasses, children, homeworkGrades, homeworkItems } from "../db/schema.js";
import { type LlmModel, listModels } from "../lib/llm.js";
import { log } from "../lib/logger.js";
import { type EmailContent, loadSmtpConfig, type SmtpConfig, sendEmail } from "./email.js";
import { type GradeOutcome, type GraderDeps, gradeSubmission } from "./grader.js";
import { renderGradeAlert } from "./grading-email.js";
import { loadGradingInput } from "./grading-input.js";
import { GRADING_PROMPT_VERSION, type GradingInput } from "./grading-prompt.js";

export type GradeRow = typeof homeworkGrades.$inferSelect;

// --- Settings --------------------------------------------------------------------

export async function loadGradingSettings(db: Database): Promise<GradingSettings> {
  const k = GRADING_SETTING_KEYS;
  const alertBelow = Number.parseInt((await getSetting(db, k.alertBelow)) ?? "", 10);
  const enabledAt = (await getSetting(db, k.enabledAt)) || null;
  return {
    enabled: (await getSetting(db, k.enabled)) === "1",
    enabledAt: enabledAt && !Number.isNaN(Date.parse(enabledAt)) ? enabledAt : null,
    model: (await getSetting(db, k.model))?.trim() || GRADING_DEFAULTS.model,
    fallbackModel: (await getSetting(db, k.fallbackModel)) ?? GRADING_DEFAULTS.fallbackModel,
    alertBelow:
      Number.isFinite(alertBelow) && alertBelow >= 0 && alertBelow <= 100
        ? alertBelow
        : GRADING_DEFAULTS.alertBelow,
    instructions: (await getSetting(db, k.instructions)) ?? "",
    matchModel: (await getSetting(db, k.matchModel))?.trim() || GRADING_DEFAULTS.matchModel,
  };
}

/** Save Settings → Grading. Turning grading on stamps `enabledAt`: older Submits wait for a backfill. */
export async function saveGradingSettings(
  db: Database,
  input: GradingSettingsInput,
  now: Date = new Date(),
): Promise<GradingSettings> {
  const k = GRADING_SETTING_KEYS;
  const before = await loadGradingSettings(db);
  await setSetting(db, k.enabled, input.enabled ? "1" : "0");
  await setSetting(db, k.model, input.model.trim());
  await setSetting(db, k.fallbackModel, input.fallbackModel.trim());
  await setSetting(db, k.alertBelow, String(input.alertBelow));
  await setSetting(db, k.instructions, input.instructions.trim());
  await setSetting(db, k.matchModel, input.matchModel.trim());
  if (input.enabled && !before.enabled) await setSetting(db, k.enabledAt, now.toISOString());
  const after = await loadGradingSettings(db);
  log.info(
    {
      event: "grading.settings.saved",
      enabled: after.enabled,
      model: after.model,
      fallback_model: after.fallbackModel,
      alert_below: after.alertBelow,
      match_model: after.matchModel,
    },
    "grading settings saved",
  );
  return after;
}

/** Chat models llmgw says answer, with whether each reads images (the grader needs that). */
export async function gradingModels(
  listModelsImpl: () => Promise<LlmModel[]> = () => listModels(),
): Promise<GradingModelList> {
  try {
    const models = (await listModelsImpl())
      .filter((m) => m.ok && (m.capability === null || m.capability === "chat"))
      .map((m) => ({ id: m.id, ownedBy: m.ownedBy, readsImages: m.readsImages }));
    return { models, unavailable: false };
  } catch (err) {
    log.warn({ event: "grading.models.unavailable", err }, "llmgw model list unavailable");
    return { models: [], unavailable: true };
  }
}

// --- Where a submission stands ----------------------------------------------------

/** Grade rows for each item's CURRENT Submit, newest first. */
async function rowsForCurrentSubmissions(
  db: Database,
  itemIds: readonly string[],
): Promise<Map<string, GradeRow[]>> {
  const byItem = new Map<string, GradeRow[]>();
  if (itemIds.length === 0) return byItem;
  const rows = await db
    .select({ grade: homeworkGrades })
    .from(homeworkGrades)
    .innerJoin(homeworkItems, eq(homeworkItems.id, homeworkGrades.itemId))
    .where(
      and(
        inArray(homeworkGrades.itemId, [...itemIds]),
        sql`date_trunc('milliseconds', ${homeworkGrades.submittedAt}) = date_trunc('milliseconds', ${homeworkItems.submittedAt})`,
      ),
    )
    .orderBy(desc(homeworkGrades.createdAt));
  for (const { grade } of rows) {
    const list = byItem.get(grade.itemId) ?? [];
    list.push(grade);
    byItem.set(grade.itemId, list);
  }
  return byItem;
}

export interface SubmissionState {
  /** The newest usable grade (not `failed`). */
  grade: GradeRow | null;
  failedCount: number;
  lastFailedAt: Date | null;
}

export function submissionState(rows: readonly GradeRow[]): SubmissionState {
  const failed = rows.filter((r) => r.status === "failed");
  return {
    grade: rows.find((r) => r.status !== "failed") ?? null,
    failedCount: failed.length,
    lastFailedAt: failed[0]?.createdAt ?? null,
  };
}

/** The sweep will (or may later) grade this Submit. */
export function isWaiting(
  submittedAt: Date | null,
  state: SubmissionState,
  settings: GradingSettings,
): boolean {
  if (!submittedAt || !settings.enabled || state.grade) return false;
  if (settings.enabledAt && submittedAt < new Date(settings.enabledAt)) return false;
  return nextGradeAttemptAt(state.failedCount, state.lastFailedAt ?? submittedAt) !== null;
}

// --- The parent's Grade again (in memory, emptied by the next sweep) -------------

const regradeRequests = new Map<string, string | null>();

export function requestRegrade(itemId: string, userId: string | null): void {
  regradeRequests.set(itemId, userId);
}

export function regradePending(itemId: string): boolean {
  return regradeRequests.has(itemId);
}

// --- What each side sees ------------------------------------------------------

function toGrade(row: GradeRow, alertBelow: number): HomeworkGrade {
  return {
    id: row.id,
    itemId: row.itemId,
    submittedAt: row.submittedAt.toISOString(),
    status: row.status as GradeStatus,
    score: row.score,
    summary: row.summary,
    findings: row.findings,
    stuck: row.stuck,
    retakeReason: row.retakeReason,
    retakePhotoIds: row.retakePhotoIds,
    sheetTitle: row.sheetTitle,
    model: row.model,
    createdAt: row.createdAt.toISOString(),
    alertedAt: row.alertedAt?.toISOString() ?? null,
    needsParent:
      row.status !== "failed" &&
      gradeNeedsParent(
        { status: row.status as GradeStatus, score: row.score, retakeReason: row.retakeReason },
        alertBelow,
      ),
    lowScore: row.status === "graded" && row.score !== null && row.score < alertBelow,
    error: row.error,
  };
}

/** Every grade of an item, newest first (the parent's item page). */
export async function gradesForItem(db: Database, itemId: string): Promise<HomeworkGradeList> {
  const settings = await loadGradingSettings(db);
  const [item] = await db
    .select({ submittedAt: homeworkItems.submittedAt })
    .from(homeworkItems)
    .where(eq(homeworkItems.id, itemId));
  const rows = await db
    .select()
    .from(homeworkGrades)
    .where(eq(homeworkGrades.itemId, itemId))
    .orderBy(desc(homeworkGrades.createdAt));
  const current = (await rowsForCurrentSubmissions(db, [itemId])).get(itemId) ?? [];
  return {
    grades: rows.map((r) => toGrade(r, settings.alertBelow)),
    pending:
      regradePending(itemId) ||
      isWaiting(item?.submittedAt ?? null, submissionState(current), settings),
    enabled: settings.enabled,
  };
}

/** A chip per list row (parent). null = nothing to say (not submitted, grading off). */
export async function gradeBriefs(
  db: Database,
  items: readonly { id: string; submittedAt: string | null }[],
): Promise<Map<string, HomeworkGradeBrief | null>> {
  const settings = await loadGradingSettings(db);
  const rows = await rowsForCurrentSubmissions(
    db,
    items.map((i) => i.id),
  );
  const out = new Map<string, HomeworkGradeBrief | null>();
  for (const item of items) {
    const submittedAt = item.submittedAt ? new Date(item.submittedAt) : null;
    const state = submissionState(rows.get(item.id) ?? []);
    if (regradePending(item.id) || isWaiting(submittedAt, state, settings)) {
      out.set(item.id, {
        status: "pending",
        score: null,
        needsParent: false,
        lowScore: false,
        retake: false,
      });
    } else if (state.grade) {
      const g = toGrade(state.grade, settings.alertBelow);
      out.set(item.id, {
        status: g.status,
        score: g.score,
        needsParent: g.needsParent,
        lowScore: g.status === "graded" && g.score !== null && g.score < settings.alertBelow,
        retake: g.retakeReason !== null,
      });
    } else if (submittedAt && state.failedCount > 0) {
      out.set(item.id, {
        status: "failed",
        score: null,
        needsParent: false,
        lowScore: false,
        retake: false,
      });
    } else {
      out.set(item.id, null);
    }
  }
  return out;
}

/**
 * The child's view (ADR 0014): a retake request while the item isn't past due,
 * or "checking" while her latest Submit waits — never a score or a finding.
 */
export async function childPhotoChecks(
  db: Database,
  items: readonly { id: string; submittedAt: string | null; dueOn: string }[],
  today: string,
): Promise<Map<string, ChildPhotoCheck | null>> {
  const settings = await loadGradingSettings(db);
  const rows = await rowsForCurrentSubmissions(
    db,
    items.map((i) => i.id),
  );
  const out = new Map<string, ChildPhotoCheck | null>();
  for (const item of items) {
    const submittedAt = item.submittedAt ? new Date(item.submittedAt) : null;
    const state = submissionState(rows.get(item.id) ?? []);
    const checking = isWaiting(submittedAt, state, settings);
    const reason = state.grade?.retakeReason ?? null;
    const retake =
      reason && item.dueOn >= today
        ? { reason, photoIds: state.grade?.retakePhotoIds ?? [] }
        : null;
    out.set(item.id, retake || checking ? { retake, checking } : null);
  }
  return out;
}

// --- Grading one Submit -----------------------------------------------------------

export interface GradingDeps extends GraderDeps {
  /** Grade without llmgw (tests). */
  grade?: (
    input: GradingInput,
    models: { model: string; fallbackModel: string },
  ) => Promise<GradeOutcome>;
  sendEmailImpl?: (cfg: SmtpConfig, content: EmailContent) => Promise<void>;
  clock?: () => Date;
}

interface GradeOptions {
  /** Only grade if the item is still at this Submit (the sweep's pick). */
  expectedSubmittedAt?: Date;
  /** The parent pressed Grade again: no alert, already "reported". */
  requestedBy?: string | null;
  /** Backfill: no alert, already reported. */
  silent?: boolean;
}

/** Grade an item's current Submit and store it. null = nothing to grade (gone, re-submitted). */
export async function gradeItem(
  db: Database,
  itemId: string,
  settings: GradingSettings,
  deps: GradingDeps = {},
  opts: GradeOptions = {},
): Promise<GradeRow | null> {
  const clock = deps.clock ?? (() => new Date());
  const input = await loadGradingInput(db, itemId, settings.instructions);
  if (!input) return null;
  if (
    opts.expectedSubmittedAt &&
    input.submittedAt.getTime() !== opts.expectedSubmittedAt.getTime()
  ) {
    return null; // she submitted again meanwhile: the next pass grades the new one
  }
  const models = { model: settings.model, fallbackModel: settings.fallbackModel };
  const outcome = deps.grade
    ? await deps.grade(input, models)
    : await gradeSubmission(input, models, deps);

  const quiet = opts.silent || opts.requestedBy !== undefined;
  const [row] = await db
    .insert(homeworkGrades)
    .values({
      itemId,
      submittedAt: input.submittedAt,
      status: outcome.status,
      score: outcome.score,
      summary: outcome.summary,
      findings: outcome.findings,
      stuck: outcome.stuck,
      retakeReason: outcome.retakeReason,
      retakePhotoIds: outcome.retakePhotoIds,
      sheetTitle: outcome.sheetTitle,
      photoIds: outcome.photoIds,
      model: outcome.model,
      promptVersion: GRADING_PROMPT_VERSION,
      durationMs: outcome.durationMs,
      usage: outcome.usage,
      error: outcome.error,
      requestedBy: opts.requestedBy ?? null,
      reportedAt: quiet ? clock() : null,
    })
    .returning();
  if (!row) return null;

  const fields = {
    item_id: itemId,
    child_id: input.childId,
    status: outcome.status,
    score: outcome.score,
    retake: outcome.retakeReason !== null,
    model: outcome.model,
    prompt_version: GRADING_PROMPT_VERSION,
    duration_ms: outcome.durationMs,
    photo_count: outcome.photoIds.length,
    requested: opts.requestedBy !== undefined,
  };
  if (outcome.status === "failed") {
    log.warn({ ...fields, event: "grading.failed", error: outcome.error }, "grading failed");
    return row;
  }
  log.info({ ...fields, event: "grading.done" }, "submission graded");

  const needsParent = gradeNeedsParent(outcome, settings.alertBelow);
  if (needsParent && !quiet && outcome.status !== "not_gradable") {
    return (await sendGradeAlert(db, row, input, settings, deps)) ?? row;
  }
  return row;
}

async function sendGradeAlert(
  db: Database,
  row: GradeRow,
  input: GradingInput,
  settings: GradingSettings,
  deps: GradingDeps,
): Promise<GradeRow | null> {
  const cfg = await loadSmtpConfig(db);
  if (!cfg) {
    log.info(
      { event: "grading.alert.skip", item_id: row.itemId, reason: "smtp_unconfigured" },
      "grade alert not sent",
    );
    return null;
  }
  const content = renderGradeAlert({
    childName: input.childName,
    className: input.className,
    title: input.title,
    dueOn: input.dueOn,
    status: row.status as "graded" | "retake" | "not_gradable",
    score: row.score,
    summary: row.summary,
    findings: row.findings,
    stuck: row.stuck,
    retakeReason: row.retakeReason,
    alertBelow: settings.alertBelow,
    url: `${config.webUrl.replace(/\/+$/, "")}/review/homework/${row.itemId}`,
  });
  try {
    await (deps.sendEmailImpl ?? sendEmail)(cfg, content);
  } catch (err) {
    log.error(
      { event: "grading.alert.failed", item_id: row.itemId, grade_id: row.id, err },
      "grade alert failed",
    );
    return null;
  }
  const clock = deps.clock ?? (() => new Date());
  const [updated] = await db
    .update(homeworkGrades)
    .set({ alertedAt: clock() })
    .where(eq(homeworkGrades.id, row.id))
    .returning();
  log.info(
    { event: "grading.alert.sent", item_id: row.itemId, grade_id: row.id, score: row.score },
    "grade alert sent",
  );
  return updated ?? null;
}

// --- The sweep ---------------------------------------------------------------------

/** Settled Submits the sweep may grade now, oldest first. */
export async function waitingSubmissions(
  db: Database,
  settings: GradingSettings,
  now: Date,
): Promise<{ itemId: string; submittedAt: Date }[]> {
  if (!settings.enabled) return [];
  const cutoff = new Date(now.getTime() - GRADING_LIMITS.settleMs);
  const candidates = await db
    .select({ itemId: homeworkItems.id, submittedAt: homeworkItems.submittedAt })
    .from(homeworkItems)
    .innerJoin(children, eq(children.id, homeworkItems.childId))
    .where(
      and(
        eq(children.homeworkSource, "child"),
        sql`${homeworkItems.submittedAt} IS NOT NULL`,
        sql`${homeworkItems.submittedAt} <= ${cutoff.toISOString()}::timestamptz`,
        settings.enabledAt
          ? sql`${homeworkItems.submittedAt} >= ${settings.enabledAt}::timestamptz`
          : undefined,
        sql`NOT EXISTS (SELECT 1 FROM homework_grades g WHERE g.item_id = ${homeworkItems.id} AND g.status <> 'failed' AND date_trunc('milliseconds', g.submitted_at) = date_trunc('milliseconds', ${homeworkItems.submittedAt}))`,
      ),
    )
    .orderBy(homeworkItems.submittedAt);
  if (candidates.length === 0) return [];
  const rows = await rowsForCurrentSubmissions(
    db,
    candidates.map((c) => c.itemId),
  );
  return candidates.flatMap((c) => {
    if (!c.submittedAt) return [];
    const state = submissionState(rows.get(c.itemId) ?? []);
    const next = nextGradeAttemptAt(state.failedCount, state.lastFailedAt ?? c.submittedAt);
    return next && next <= now ? [{ itemId: c.itemId, submittedAt: c.submittedAt }] : [];
  });
}

export interface SweepResult {
  graded: number;
  busy: boolean;
}

let sweeping = false;

/** One sweep: the parent's Grade again requests, then every settled waiting Submit. */
export async function runGradingSweep(db: Database, deps: GradingDeps = {}): Promise<SweepResult> {
  if (sweeping) return { graded: 0, busy: true };
  sweeping = true;
  const clock = deps.clock ?? (() => new Date());
  let graded = 0;
  try {
    const settings = await loadGradingSettings(db);
    for (const [itemId, userId] of [...regradeRequests]) {
      try {
        await gradeItem(db, itemId, settings, deps, { requestedBy: userId });
        graded += 1;
      } finally {
        regradeRequests.delete(itemId);
      }
    }
    const tried = new Set<string>();
    for (let i = 0; i < 25; i += 1) {
      const next = (await waitingSubmissions(db, settings, clock())).find(
        (w) => !tried.has(w.itemId),
      );
      if (!next) break;
      tried.add(next.itemId);
      const row = await gradeItem(db, next.itemId, settings, deps, {
        expectedSubmittedAt: next.submittedAt,
      });
      if (row) graded += 1;
    }
    if (graded > 0) log.info({ event: "grading.sweep", graded }, "grading sweep finished");
    return { graded, busy: false };
  } finally {
    sweeping = false;
  }
}

// --- Backfill (scripts/grade-backfill.ts) ---------------------------------------

/** Grade every submitted item that has no usable grade yet — quietly (no alerts, not in the digest). */
export async function backfillGrades(
  db: Database,
  deps: GradingDeps = {},
): Promise<{ graded: number; failed: number }> {
  const settings = await loadGradingSettings(db);
  const items = await db
    .select({ id: homeworkItems.id })
    .from(homeworkItems)
    .innerJoin(children, eq(children.id, homeworkItems.childId))
    .where(
      and(
        eq(children.homeworkSource, "child"),
        sql`${homeworkItems.submittedAt} IS NOT NULL`,
        sql`NOT EXISTS (SELECT 1 FROM homework_grades g WHERE g.item_id = ${homeworkItems.id} AND g.status <> 'failed' AND date_trunc('milliseconds', g.submitted_at) = date_trunc('milliseconds', ${homeworkItems.submittedAt}))`,
      ),
    )
    .orderBy(homeworkItems.submittedAt);
  let graded = 0;
  let failed = 0;
  for (const { id } of items) {
    const row = await gradeItem(db, id, settings, deps, { silent: true });
    if (row?.status === "failed") failed += 1;
    else if (row) graded += 1;
  }
  return { graded, failed };
}

// --- The daily digest ------------------------------------------------------------

export interface DigestGradeLine {
  childId: string;
  itemId: string;
  className: string;
  title: string;
  status: GradeStatus;
  score: number | null;
  summary: string | null;
  needsParent: boolean;
  retake: boolean;
  stuck: boolean;
  /** An alert email already went out for it. */
  alerted: boolean;
}

export interface DigestGrades {
  lines: DigestGradeLine[];
  /** Mark these reported once the digest is sent. */
  gradeIds: string[];
}

/**
 * Grades the digest hasn't listed yet: per item, its newest usable grade, or
 * "couldn't grade" once every try failed. Retries still to come are left out.
 */
export async function gradesForDigest(db: Database): Promise<DigestGrades> {
  const settings = await loadGradingSettings(db);
  const unreported = await db
    .select({
      grade: homeworkGrades,
      childId: homeworkItems.childId,
      title: homeworkItems.title,
      className: childClasses.name,
    })
    .from(homeworkGrades)
    .innerJoin(homeworkItems, eq(homeworkItems.id, homeworkGrades.itemId))
    .leftJoin(childClasses, eq(childClasses.id, homeworkItems.classId))
    .where(isNull(homeworkGrades.reportedAt))
    .orderBy(desc(homeworkGrades.createdAt));
  const byItem = new Map<string, typeof unreported>();
  for (const r of unreported) {
    const list = byItem.get(r.grade.itemId) ?? [];
    list.push(r);
    byItem.set(r.grade.itemId, list);
  }
  const lines: DigestGradeLine[] = [];
  const gradeIds: string[] = [];
  for (const [itemId, list] of byItem) {
    const newest = list[0];
    if (!newest) continue;
    const usable = list.find(
      (r) =>
        r.grade.status !== "failed" &&
        r.grade.submittedAt.getTime() === newest.grade.submittedAt.getTime(),
    );
    const pick = usable ?? newest;
    if (!usable) {
      // Every row of the newest Submit failed: wait until the tries run out.
      const [{ n } = { n: 0 }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(homeworkGrades)
        .where(
          and(
            eq(homeworkGrades.itemId, itemId),
            eq(homeworkGrades.status, "failed"),
            sql`date_trunc('milliseconds', ${homeworkGrades.submittedAt}) = date_trunc('milliseconds', ${newest.grade.submittedAt.toISOString()}::timestamptz)`,
          ),
        );
      if (n < GRADING_LIMITS.maxAttempts) continue;
    }
    const g = pick.grade;
    lines.push({
      childId: pick.childId,
      itemId,
      className: pick.className ?? "Other",
      title: pick.title,
      status: g.status as GradeStatus,
      score: g.score,
      summary: g.summary,
      needsParent:
        g.status !== "failed" &&
        gradeNeedsParent(
          { status: g.status as GradeStatus, score: g.score, retakeReason: g.retakeReason },
          settings.alertBelow,
        ),
      retake: g.retakeReason !== null,
      stuck: g.stuck,
      alerted: g.alertedAt !== null,
    });
    gradeIds.push(...list.map((r) => r.grade.id));
  }
  return { lines, gradeIds };
}

export async function markGradesReported(
  db: Database,
  gradeIds: readonly string[],
  now: Date,
): Promise<void> {
  if (gradeIds.length === 0) return;
  await db
    .update(homeworkGrades)
    .set({ reportedAt: now })
    .where(inArray(homeworkGrades.id, [...gradeIds]));
}
