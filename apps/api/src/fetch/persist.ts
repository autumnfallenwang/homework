// Drizzle persistence for the fetch pipeline. Replaces the desktop app's
// SQLite/IPC persist functions (ipc.ts: startFetchRun, completeFetchRun,
// persistTeacherEaseData, persistHomework). Behavior is 1:1 with the source;
// only the storage layer changed (Drizzle/Postgres, uuid ids, jsonb payload).

import { eq } from "drizzle-orm";
import type { Database } from "../db/index.js";
import {
  assignments,
  classes,
  fetchRuns,
  grades,
  homework,
  rawPayloads,
  standards,
} from "../db/schema.js";
import { hwDateToIso, resolveDueDate } from "../scraper/homework-date.js";
import type {
  Assignment,
  ClassDetails,
  ClassOverview,
  GradesOverview,
  HomeworkEntry,
  Standard,
} from "../scraper/types.js";
import type { FetchRunCompletion } from "./types.js";

/** Insert a fetch_runs row in 'success' state; finalized by completeFetchRun. */
export async function startFetchRun(
  db: Database,
  childId: string,
  source: string,
): Promise<string> {
  const [row] = await db
    .insert(fetchRuns)
    .values({ childId, source, status: "success" })
    .returning({ id: fetchRuns.id });
  if (!row) throw new Error("startFetchRun: INSERT returned no id");
  return row.id;
}

/** Finalize a fetch_runs row with status/duration/error. */
export async function completeFetchRun(
  db: Database,
  id: string,
  result: FetchRunCompletion,
): Promise<void> {
  await db
    .update(fetchRuns)
    .set({
      status: result.status,
      durationMs: result.durationMs,
      errorMessage: result.errorMessage ?? null,
    })
    .where(eq(fetchRuns.id, id));
}

async function upsertClasses(
  db: Database,
  childId: string,
  overviewClasses: readonly ClassOverview[],
): Promise<Map<number, string>> {
  // teClassId (TeacherEase's numeric id) → our uuid PK.
  const map = new Map<number, string>();
  for (const cls of overviewClasses) {
    const [row] = await db
      .insert(classes)
      .values({
        childId,
        teClassId: cls.classId,
        teCgpid: cls.cgpId,
        name: cls.name,
        instructor: cls.instructor,
      })
      .onConflictDoUpdate({
        target: [classes.childId, classes.teClassId],
        set: {
          teCgpid: cls.cgpId,
          name: cls.name,
          instructor: cls.instructor,
          updatedAt: new Date(),
        },
      })
      .returning({ id: classes.id });
    if (row) map.set(cls.classId, row.id);
  }
  return map;
}

async function persistStandards(
  db: Database,
  fetchRunId: string,
  classId: string,
  standardsList: readonly Standard[],
  parentId: string | null,
): Promise<void> {
  for (const std of standardsList) {
    const [row] = await db
      .insert(standards)
      .values({
        fetchRunId,
        classId,
        parentId,
        name: std.name,
        scoreNumeric: std.scoreNumeric,
        scoreLetter: std.scoreLetter,
        isMeeting: std.isMeeting,
      })
      .returning({ id: standards.id });
    const stdId = row?.id ?? null;
    if (std.children.length > 0 && stdId != null) {
      await persistStandards(db, fetchRunId, classId, std.children, stdId);
    }
  }
}

async function persistAssignmentsDeduplicated(
  db: Database,
  fetchRunId: string,
  classId: string,
  className: string,
  standardsList: readonly Standard[],
): Promise<void> {
  // Walk the tree, dedup by testNameId (the same assignment can appear under
  // multiple standards), insert each once.
  const seen = new Set<number>();
  const rows: Array<typeof assignments.$inferInsert> = [];

  const walk = (list: readonly Standard[]): void => {
    for (const std of list) {
      for (const a of std.assignments) {
        if (a.testNameId !== 0 && seen.has(a.testNameId)) continue;
        if (a.testNameId !== 0) seen.add(a.testNameId);
        rows.push(toAssignmentRow(fetchRunId, classId, className, a));
      }
      walk(std.children);
    }
  };
  walk(standardsList);

  if (rows.length > 0) await db.insert(assignments).values(rows);
}

function toAssignmentRow(
  fetchRunId: string,
  classId: string,
  className: string,
  a: Assignment,
): typeof assignments.$inferInsert {
  return {
    fetchRunId,
    classId,
    className,
    assignmentName: a.name,
    name: a.name,
    teAssignmentId: a.testNameId,
    score: a.grade,
    scoreNumeric: a.gradeNumeric,
    scoreLetter: a.gradeLetter,
    status: a.isMissing ? "missing" : a.gradeLetter,
    dueDate: a.dueDate,
    weight: a.weight === "" ? null : Number.parseInt(a.weight, 10),
    isMissing: a.isMissing,
    feedback: a.feedback,
  };
}

/**
 * Persist a TeacherEase scrape: raw payload (jsonb), upserted classes, grades
 * with progress, standards tree, and deduplicated assignments. The fetch_runs
 * row (and its childId) must already exist.
 */
export async function persistTeacherEaseData(
  db: Database,
  fetchRunId: string,
  overview: GradesOverview,
  classDetails: readonly ClassDetails[],
): Promise<void> {
  // Raw payload — stored as a jsonb object (no JSON.stringify; M02 decision).
  await db.insert(rawPayloads).values({ fetchRunId, payload: { overview, classDetails } });

  const [run] = await db
    .select({ childId: fetchRuns.childId })
    .from(fetchRuns)
    .where(eq(fetchRuns.id, fetchRunId));
  if (!run) throw new Error(`persistTeacherEaseData: fetchRunId=${fetchRunId} not found`);
  const childId = run.childId;

  const classIdMap = await upsertClasses(db, childId, overview.classes);

  for (const cls of overview.classes) {
    const classId = classIdMap.get(cls.classId);
    const notAssessed = cls.totalTargets - cls.targetsMeeting - cls.targetsNotMeeting;
    await db.insert(grades).values({
      fetchRunId,
      classId: classId ?? null,
      className: cls.name,
      currentGrade: `${cls.statusCode}`,
      status: cls.status,
      needsAttention: cls.needsAttention,
      targetsMeeting: cls.targetsMeeting,
      targetsNotMeeting: cls.targetsNotMeeting,
      targetsNotAssessed: notAssessed,
    });
  }

  for (const detail of classDetails) {
    const cls = overview.classes.find((c) => c.name === detail.className);
    const classId = cls ? classIdMap.get(cls.classId) : undefined;
    if (!classId) continue;
    await persistStandards(db, fetchRunId, classId, detail.standards, null);
    await persistAssignmentsDeduplicated(
      db,
      fetchRunId,
      classId,
      detail.className,
      detail.standards,
    );
  }
}

/** Persist homework entries, upserting on (childId, hwDate, subject). */
export async function persistHomework(
  db: Database,
  childId: string,
  entries: readonly HomeworkEntry[],
): Promise<number> {
  let persisted = 0;
  for (const entry of entries) {
    const iso = hwDateToIso(entry.date);
    if (!iso) continue;
    if (entry.subjects.length === 0) continue;

    for (const subj of entry.subjects) {
      const resolved = resolveDueDate(subj.dueDate, iso);
      await db
        .insert(homework)
        .values({
          childId,
          hwDate: iso,
          subject: subj.name,
          content: subj.content,
          dueDate: resolved.iso,
          dueDateInferred: resolved.inferred,
        })
        .onConflictDoUpdate({
          target: [homework.childId, homework.hwDate, homework.subject],
          set: {
            content: subj.content,
            dueDate: resolved.iso,
            dueDateInferred: resolved.inferred,
            scrapedAt: new Date(),
          },
        });
      persisted += 1;
    }
  }
  return persisted;
}
