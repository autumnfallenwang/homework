// Read/write query layer for the HTTP API. Ports the read queries the desktop
// app exposed via ipc.ts into Drizzle, and maps DB rows → the shared response
// records (uuid string ids, ISO-string timestamps). The fetch pipeline's
// write helpers live in ../fetch/persist.ts; this module is everything the
// routes read plus the small mutations (child CRUD, settings, reset).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type AddChildInput,
  type AttentionConfig,
  type ChildRecord,
  type ClassDetails,
  type ClassRecord,
  classDetailsSchema,
  type FetchRunRecord,
  type FetchRunStatus,
  type GradeRecord,
  type HomeworkMonth,
  type HomeworkRecord,
  parseAttentionConfig,
  type StatusHistoryEntry,
} from "@homework/shared";
import { and, asc, desc, eq, like, sql } from "drizzle-orm";
import type { Database } from "./index.js";
import {
  assignments,
  children,
  classes,
  fetchRuns,
  grades,
  homework,
  rawPayloads,
  settings,
} from "./schema.js";
import { seedSettings } from "./seed-settings.js";

// --- Row → record mappers -------------------------------------------------

function toChildRecord(row: typeof children.$inferSelect): ChildRecord {
  return {
    id: row.id,
    displayName: row.displayName,
    portalType: row.portalType,
    baseUrl: row.baseUrl,
    username: row.username,
    grade: row.grade,
    school: row.school,
    homeworkUrl: row.homeworkUrl,
    createdAt: row.createdAt.toISOString(),
  };
}

function toFetchRunRecord(row: typeof fetchRuns.$inferSelect): FetchRunRecord {
  return {
    id: row.id,
    childId: row.childId,
    source: row.source,
    runAt: row.runAt.toISOString(),
    status: row.status as FetchRunStatus,
    durationMs: row.durationMs,
    errorMessage: row.errorMessage,
  };
}

function toClassRecord(row: typeof classes.$inferSelect): ClassRecord {
  return {
    id: row.id,
    childId: row.childId,
    teClassId: row.teClassId,
    teCgpid: row.teCgpid,
    name: row.name,
    instructor: row.instructor,
    gradingScale: row.gradingScale,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toGradeRecord(row: typeof grades.$inferSelect): GradeRecord {
  return {
    id: row.id,
    fetchRunId: row.fetchRunId,
    classId: row.classId,
    className: row.className,
    currentGrade: row.currentGrade,
    status: row.status,
    needsAttention: row.needsAttention,
    targetsMeeting: row.targetsMeeting,
    targetsNotMeeting: row.targetsNotMeeting,
    targetsNotAssessed: row.targetsNotAssessed,
  };
}

function toHomeworkRecord(row: typeof homework.$inferSelect): HomeworkRecord {
  return {
    id: row.id,
    childId: row.childId,
    hwDate: row.hwDate,
    subject: row.subject,
    content: row.content,
    dueDate: row.dueDate,
    dueDateInferred: row.dueDateInferred,
    scrapedAt: row.scrapedAt.toISOString(),
  };
}

// --- Children -------------------------------------------------------------

export async function getChildren(db: Database): Promise<ChildRecord[]> {
  const rows = await db.select().from(children).orderBy(asc(children.createdAt));
  return rows.map(toChildRecord);
}

export async function getChild(db: Database, id: string): Promise<ChildRecord | null> {
  const [row] = await db.select().from(children).where(eq(children.id, id));
  return row ? toChildRecord(row) : null;
}

export async function getChildPassword(db: Database, id: string): Promise<string | null> {
  const [row] = await db
    .select({ portalPassword: children.portalPassword })
    .from(children)
    .where(eq(children.id, id));
  return row ? row.portalPassword : null;
}

export async function addChild(db: Database, params: AddChildInput): Promise<string> {
  const [row] = await db
    .insert(children)
    .values({
      displayName: params.displayName,
      baseUrl: params.baseUrl,
      username: params.username,
      portalPassword: params.password,
      grade: params.grade ?? null,
      school: params.school ?? null,
      homeworkUrl: params.homeworkUrl ?? null,
    })
    .returning({ id: children.id });
  if (!row) throw new Error("addChild: INSERT returned no id");
  return row.id;
}

export async function updateChildIdentity(
  db: Database,
  id: string,
  params: { displayName: string; username: string },
): Promise<void> {
  await db
    .update(children)
    .set({ displayName: params.displayName, username: params.username })
    .where(eq(children.id, id));
}

export async function updateChildPassword(
  db: Database,
  id: string,
  password: string,
): Promise<void> {
  await db.update(children).set({ portalPassword: password }).where(eq(children.id, id));
}

export async function setHomeworkUrl(db: Database, id: string, url: string | null): Promise<void> {
  await db.update(children).set({ homeworkUrl: url }).where(eq(children.id, id));
}

/** Delete a child. FK cascade clears all downstream rows. Returns false if no
 *  such child existed. */
export async function removeChild(db: Database, id: string): Promise<boolean> {
  const deleted = await db
    .delete(children)
    .where(eq(children.id, id))
    .returning({ id: children.id });
  return deleted.length > 0;
}

// --- Fetch runs -----------------------------------------------------------

export async function getLatestSuccessfulFetchRun(
  db: Database,
  childId: string,
  source: string,
): Promise<FetchRunRecord | null> {
  const [row] = await db
    .select()
    .from(fetchRuns)
    .where(
      and(
        eq(fetchRuns.childId, childId),
        eq(fetchRuns.source, source),
        eq(fetchRuns.status, "success"),
      ),
    )
    .orderBy(desc(fetchRuns.runAt))
    .limit(1);
  return row ? toFetchRunRecord(row) : null;
}

export async function getLatestFetchRun(
  db: Database,
  childId: string,
): Promise<FetchRunRecord | null> {
  const [row] = await db
    .select()
    .from(fetchRuns)
    .where(eq(fetchRuns.childId, childId))
    .orderBy(desc(fetchRuns.runAt))
    .limit(1);
  return row ? toFetchRunRecord(row) : null;
}

export interface FetchRunsFilter {
  readonly latest?: boolean;
  readonly successful?: boolean;
  readonly source?: string;
  readonly limit?: number;
}

export async function getFetchRunsForChild(
  db: Database,
  childId: string,
  filter: FetchRunsFilter = {},
): Promise<FetchRunRecord[]> {
  const conds = [eq(fetchRuns.childId, childId)];
  if (filter.source) conds.push(eq(fetchRuns.source, filter.source));
  if (filter.successful) conds.push(eq(fetchRuns.status, "success"));

  const base = db
    .select()
    .from(fetchRuns)
    .where(and(...conds))
    .orderBy(desc(fetchRuns.runAt));

  const limit = filter.latest ? 1 : filter.limit;
  const rows = limit ? await base.limit(limit) : await base;
  return rows.map(toFetchRunRecord);
}

// --- Grades / assignments / classes --------------------------------------

export async function getGradesForFetchRun(
  db: Database,
  fetchRunId: string,
): Promise<GradeRecord[]> {
  const rows = await db
    .select()
    .from(grades)
    .where(eq(grades.fetchRunId, fetchRunId))
    .orderBy(asc(grades.className));
  return rows.map(toGradeRecord);
}

export async function getClasses(db: Database, childId: string): Promise<ClassRecord[]> {
  const rows = await db
    .select()
    .from(classes)
    .where(eq(classes.childId, childId))
    .orderBy(asc(classes.name));
  return rows.map(toClassRecord);
}

/**
 * Latest grades for a child: the grades of its most recent successful
 * teacherease fetch run. Returns an empty array (not an error) when the child
 * has never had a successful run.
 */
export async function getLatestGrades(db: Database, childId: string): Promise<GradeRecord[]> {
  const run = await getLatestSuccessfulFetchRun(db, childId, "teacherease");
  if (!run) return [];
  return getGradesForFetchRun(db, run.id);
}

/**
 * Per-class status history (newest first), for the trend dots. Joins grades to
 * their fetch_runs, keeps only successful runs, and caps each class to `limit`.
 */
export async function getAllStatusHistory(
  db: Database,
  childId: string,
  limit = 5,
): Promise<Record<string, StatusHistoryEntry[]>> {
  const rows = await db
    .select({
      className: grades.className,
      status: grades.status,
      needsAttention: grades.needsAttention,
      runAt: fetchRuns.runAt,
    })
    .from(grades)
    .innerJoin(fetchRuns, eq(grades.fetchRunId, fetchRuns.id))
    .where(and(eq(fetchRuns.childId, childId), eq(fetchRuns.status, "success")))
    .orderBy(desc(fetchRuns.runAt));

  const out: Record<string, StatusHistoryEntry[]> = {};
  for (const row of rows) {
    let list = out[row.className];
    if (!list) {
      list = [];
      out[row.className] = list;
    }
    if (list.length >= limit) continue;
    list.push({
      status: row.status,
      needsAttention: row.needsAttention,
      runAt: row.runAt.toISOString(),
    });
  }
  return out;
}

// --- Class details (from the jsonb raw payload) --------------------------

export async function getAllClassDetails(
  db: Database,
  fetchRunId: string,
): Promise<ClassDetails[]> {
  const [row] = await db
    .select({ payload: rawPayloads.payload })
    .from(rawPayloads)
    .where(eq(rawPayloads.fetchRunId, fetchRunId));
  if (!row) return [];
  const payload = row.payload as { classDetails?: unknown } | null;
  const parsed = classDetailsSchema.array().safeParse(payload?.classDetails ?? []);
  return parsed.success ? parsed.data : [];
}

export async function getClassDetail(
  db: Database,
  fetchRunId: string,
  className: string,
): Promise<ClassDetails | null> {
  const all = await getAllClassDetails(db, fetchRunId);
  return all.find((d) => d.className === className) ?? null;
}

// --- Homework -------------------------------------------------------------

export async function getHomeworkForDay(
  db: Database,
  childId: string,
  iso: string,
): Promise<HomeworkRecord[]> {
  const rows = await db
    .select()
    .from(homework)
    .where(and(eq(homework.childId, childId), eq(homework.hwDate, iso)))
    .orderBy(asc(homework.subject));
  return rows.map(toHomeworkRecord);
}

export async function getHomeworkByMonth(
  db: Database,
  childId: string,
  yearMonth: string,
): Promise<HomeworkRecord[]> {
  const rows = await db
    .select()
    .from(homework)
    .where(and(eq(homework.childId, childId), like(homework.hwDate, `${yearMonth}-%`)))
    .orderBy(asc(homework.hwDate), asc(homework.subject));
  return rows.map(toHomeworkRecord);
}

export async function getHomeworkMonths(db: Database, childId: string): Promise<HomeworkMonth[]> {
  const ym = sql<string>`substring(${homework.hwDate} from 1 for 7)`;
  const rows = await db
    .select({ yearMonth: ym, count: sql<number>`count(*)::int` })
    .from(homework)
    .where(eq(homework.childId, childId))
    .groupBy(ym)
    .orderBy(desc(ym));
  return rows.map((r) => ({ yearMonth: r.yearMonth, count: r.count }));
}

// --- Settings -------------------------------------------------------------

export async function getSetting(db: Database, key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key));
  return row ? row.value : null;
}

export async function setSetting(db: Database, key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

export async function getAttentionConfig(db: Database): Promise<AttentionConfig> {
  const weeks = await getSetting(db, "attention.forgivenessWeeks");
  const threshold = await getSetting(db, "attention.lowScoreThreshold");
  return parseAttentionConfig(weeks, threshold);
}

// --- App-level ------------------------------------------------------------

/** Wipe all data and re-seed defaults. Children-cascade clears fetch_runs,
 *  classes, grades, assignments, standards, raw_payloads, homework. */
export async function resetAllAppData(db: Database): Promise<void> {
  await db.delete(children);
  await db.delete(settings);
  await seedSettings(db);
}

let cachedVersion: string | null = null;
export function getAppVersion(): string {
  if (cachedVersion) return cachedVersion;
  const pkgPath = fileURLToPath(new URL("../../package.json", import.meta.url));
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
  cachedVersion = pkg.version ?? "0.0.0";
  return cachedVersion;
}

// Re-export for routes that surface assignment-level data later (homework view
// uses grades/homework; assignment detail comes from class details). Kept here
// so the import surface for routes is a single module.
export async function getAssignmentsForFetchRun(db: Database, fetchRunId: string) {
  return db.select().from(assignments).where(eq(assignments.fetchRunId, fetchRunId));
}
