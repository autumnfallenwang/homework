// Teacher-grade matching (M14) on the live Postgres, with an injected matcher:
// candidates from the latest fetch, when the model is asked again, what is
// stored, the parent's confirm / reject / pick, chips, and the digest lines.

import type { HomeworkItemList, TeacherMatchView } from "@homework/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { closeDb, db } from "../db/index.js";
import { setSetting } from "../db/queries.js";
import {
  assignments,
  childClasses,
  children,
  fetchRuns,
  homeworkGrades,
  homeworkItemAssignments,
  homeworkItems,
  settings,
  users,
} from "../db/schema.js";
import { seedSettings } from "../db/seed-settings.js";
import { PARENT } from "../test/sessions.js";
import type { EmailContent } from "./email.js";
import { runFetchCycle, runNotifyCycle } from "./scheduler.js";
import {
  type MatchCandidate,
  type MatchInput,
  type MatchPick,
  runTeacherMatching,
  teacherLinesForDigest,
} from "./teacher-match.js";

const url = process.env.DATABASE_URL;
const app = createApp({ resolveSession: async () => PARENT });

function send(method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe.skipIf(!url)("teacher-grade matching (live DB)", () => {
  let ivyId: string;
  let runId: string;
  let asked: { input: MatchInput; cands: readonly MatchCandidate[] }[];
  let picks: (input: MatchInput, cands: readonly MatchCandidate[]) => MatchPick[];
  const now = new Date("2026-11-10T20:00:00Z");

  const deps = () => ({
    match: async (input: MatchInput, cands: readonly MatchCandidate[]) => {
      asked.push({ input, cands });
      return picks(input, cands);
    },
    clock: () => now,
  });

  async function addAssignment(te: number, cls: string, name: string, due: string, score = "") {
    await db.insert(assignments).values({
      fetchRunId: runId,
      className: cls,
      assignmentName: name,
      name,
      teAssignmentId: te,
      dueDate: due,
      score,
      scoreLetter: score.split("=")[1] ?? null,
    });
  }

  async function addItem(title: string, className: string, dueOn: string, note: string) {
    const [cls] = await db
      .insert(childClasses)
      .values({ childId: ivyId, name: className })
      .onConflictDoNothing()
      .returning({ id: childClasses.id });
    const classId =
      cls?.id ??
      (
        await db
          .select({ id: childClasses.id })
          .from(childClasses)
          .where(eq(childClasses.name, className))
      )[0]?.id;
    const [row] = await db
      .insert(homeworkItems)
      .values({
        childId: ivyId,
        classId,
        title,
        assignedOn: "2026-10-30",
        dueOn,
        solutionNote: note,
        submittedAt: new Date("2026-11-01T20:00:00Z"),
      })
      .returning({ id: homeworkItems.id });
    return row?.id ?? "";
  }

  beforeEach(async () => {
    await db.delete(children);
    await db.delete(users);
    await db.delete(settings);
    await seedSettings(db);
    await setSetting(db, "grading.enabled", "1");
    asked = [];
    picks = () => [];
    const [ivy] = await db
      .insert(children)
      .values({
        displayName: "Ivy",
        baseUrl: "https://x.example.com",
        username: "ivy@e.com",
        homeworkSource: "child",
      })
      .returning({ id: children.id });
    ivyId = ivy?.id ?? "";
    const [run] = await db
      .insert(fetchRuns)
      .values({ childId: ivyId, status: "success", source: "teacherease", runAt: now })
      .returning({ id: fetchRuns.id });
    runId = run?.id ?? "";
    await addAssignment(33, "English 8", "#033 Stay & Stray Theme Reflection", "11/2", "3=M");
    await addAssignment(34, "English 8", "#034 Lit. Circle Book Check-in", "11/2", "3=M");
    await addAssignment(26, "English 8", "#026 Discussion Reflection", "10/15", "3=M");
    await addAssignment(70, "Social Studies 8", "Stamp Act Documents", "11/3", "2=P");
  });

  afterAll(async () => {
    await db.delete(children);
    await closeDb();
  });

  it("asks once per candidate set, with what the grade read off the sheet; high links, medium suggests, low drops", async () => {
    const essay = await addItem("fill out reflection", "English 8", "2026-11-02", "theme was hard");
    await addItem("study guide", "Science 8", "2026-11-02", "flashcards"); // no candidates
    await db.insert(homeworkGrades).values({
      itemId: essay,
      submittedAt: new Date("2026-11-01T20:00:00Z"),
      status: "graded",
      score: 90,
      sheetTitle: "Stay & Stray Theme Reflection",
      summary: "A theme reflection.",
      promptVersion: 1,
    });
    picks = () => [
      { teAssignmentId: 33, confidence: "high", reason: "sheet title" },
      { teAssignmentId: 34, confidence: "medium", reason: "same day" },
      { teAssignmentId: 26, confidence: "low", reason: "weak" },
    ];

    const first = await runTeacherMatching(db, ivyId, deps());
    expect(first).toEqual({ asked: 1, linked: 1, suggested: 1, failed: 0 });
    expect(asked[0]?.input.sheetTitle).toBe("Stay & Stray Theme Reflection");
    expect(asked[0]?.cands.map((c) => c.teAssignmentId)).toEqual([33, 34]);

    // Same candidates: not asked again. A new assignment posted: asked again.
    expect((await runTeacherMatching(db, ivyId, deps())).asked).toBe(0);
    await addAssignment(35, "English 8", "#035 Reflection Revision", "11/4");
    picks = () => [{ teAssignmentId: 33, confidence: "high", reason: "still" }];
    expect((await runTeacherMatching(db, ivyId, deps())).asked).toBe(1);
    const links = await db
      .select()
      .from(homeworkItemAssignments)
      .where(eq(homeworkItemAssignments.itemId, essay));
    // The medium suggestion it no longer makes is gone; the link stays.
    expect(links.map((l) => [l.teAssignmentId, l.state])).toEqual([[33, "confirmed"]]);

    // A later run that no longer makes its own link drops it…
    await addAssignment(36, "English 8", "#036 Theme Essay", "11/5");
    picks = () => [{ teAssignmentId: 36, confidence: "high", reason: "better fit" }];
    await runTeacherMatching(db, ivyId, deps());
    const relinked = await db
      .select()
      .from(homeworkItemAssignments)
      .where(eq(homeworkItemAssignments.itemId, essay));
    expect(relinked.map((l) => l.teAssignmentId)).toEqual([36]);
    // …but never one the parent confirmed.
    await send("PATCH", `/api/homework-items/${essay}/teacher/36`, { state: "confirmed" });
    await addAssignment(37, "English 8", "#037 Another", "11/6");
    picks = () => [];
    await runTeacherMatching(db, ivyId, deps());
    const kept = await db
      .select()
      .from(homeworkItemAssignments)
      .where(eq(homeworkItemAssignments.itemId, essay));
    expect(kept.map((l) => [l.teAssignmentId, l.source])).toEqual([[36, "parent"]]);
  });

  it("lets the parent confirm, reject and pick; a rejected one never comes back", async () => {
    const item = await addItem("Google doc", "Social Studies 8", "2026-10-30", "stamp act riot");
    picks = () => [{ teAssignmentId: 70, confidence: "medium", reason: "her note: Stamp Act" }];
    await runTeacherMatching(db, ivyId, deps());

    let view = (await (
      await send("GET", `/api/homework-items/${item}/teacher`)
    ).json()) as TeacherMatchView;
    expect(view.links).toEqual([
      expect.objectContaining({
        teAssignmentId: 70,
        state: "suggested",
        score: "2=P",
        band: "progressing",
      }),
    ]);
    expect(view.candidates.map((c) => c.teAssignmentId)).toEqual([70]);

    let list = (await (
      await send("GET", `/api/children/${ivyId}/homework-items`)
    ).json()) as HomeworkItemList;
    expect(list.items[0]?.teacherGrade).toEqual({
      score: "2=P",
      band: "progressing",
      probable: true,
    });

    view = (await (
      await send("PATCH", `/api/homework-items/${item}/teacher/70`, { state: "rejected" })
    ).json()) as TeacherMatchView;
    expect(view.links).toEqual([]);
    await addAssignment(71, "Social Studies 8", "Gaspee/Vocab", "10/30");
    await runTeacherMatching(db, ivyId, deps()); // proposes 70 again: ignored
    view = (await (
      await send("GET", `/api/homework-items/${item}/teacher`)
    ).json()) as TeacherMatchView;
    expect(view.links).toEqual([]);

    view = (await (
      await send("POST", `/api/homework-items/${item}/teacher`, { teAssignmentId: 70 })
    ).json()) as TeacherMatchView;
    expect(view.links).toEqual([
      expect.objectContaining({ teAssignmentId: 70, state: "confirmed", source: "parent" }),
    ]);
    expect(
      (await send("POST", `/api/homework-items/${item}/teacher`, { teAssignmentId: 33 })).status,
    ).toBe(400);
    list = (await (
      await send("GET", `/api/children/${ivyId}/homework-items`)
    ).json()) as HomeworkItemList;
    expect(list.items[0]?.teacherGrade?.probable).toBe(false);
  });

  it("tells the digest about new teacher scores once, flagging a disagreement", async () => {
    const item = await addItem("Google doc", "Social Studies 8", "2026-10-30", "stamp act riot");
    await db.insert(homeworkGrades).values({
      itemId: item,
      submittedAt: new Date("2026-11-01T20:00:00Z"),
      status: "graded",
      score: 91,
      promptVersion: 1,
      reportedAt: now,
    });
    picks = () => [{ teAssignmentId: 70, confidence: "high", reason: "Stamp Act" }];
    await runTeacherMatching(db, ivyId, deps());

    const lines = await teacherLinesForDigest(db);
    expect(lines.lines).toEqual([
      expect.objectContaining({
        assignmentName: "Stamp Act Documents",
        score: "2=P",
        modelScore: 91,
        disagree: "teacher_lower",
      }),
    ]);

    await setSetting(db, "notify.refreshDigest.email", "1");
    await setSetting(db, "notify.fetchBeforeDispatch", "0");
    for (const [k, v] of Object.entries({
      "smtp.host": "mail.example.com",
      "smtp.port": "587",
      "smtp.username": "u",
      "smtp.password": "p",
      "smtp.from": "a@example.com",
      "smtp.to": "b@example.com",
    })) {
      await setSetting(db, k, v);
    }
    const mails: EmailContent[] = [];
    await runNotifyCycle(db, {
      sendEmailImpl: async (_c, m) => void mails.push(m),
      now: () => now,
    });
    expect(mails[0]?.text).toContain(
      "Social Studies 8 · Google doc → Stamp Act Documents: 2=P · ours 91/100 · teacher lower than ours",
    );
    expect((await teacherLinesForDigest(db)).lines).toEqual([]);

    // The teacher changes the score: reported again.
    await db
      .update(assignments)
      .set({ score: "3=M", scoreLetter: "M" })
      .where(eq(assignments.teAssignmentId, 70));
    expect((await teacherLinesForDigest(db)).lines.map((l) => l.score)).toEqual(["3=M"]);
  });

  it("quiet matching (the release backfill) counts today's scores as reported", async () => {
    await addItem("fill out reflection", "English 8", "2026-11-02", "theme");
    picks = () => [{ teAssignmentId: 33, confidence: "high", reason: "theme" }];
    await runTeacherMatching(db, ivyId, deps(), { quiet: true });
    expect((await teacherLinesForDigest(db)).lines).toEqual([]);
  });

  it("runs after each child's fetch in the fetch cycle, only while grading is on", async () => {
    const ran: string[] = [];
    const cycleDeps = {
      runFetchImpl: async () => undefined,
      matchImpl: async (id: string) => {
        ran.push(id);
      },
    };
    await runFetchCycle(db, cycleDeps);
    expect(ran).toEqual([ivyId]);
    await setSetting(db, "grading.enabled", "0");
    await runFetchCycle(db, cycleDeps);
    expect(ran).toEqual([ivyId]);
  });
});
