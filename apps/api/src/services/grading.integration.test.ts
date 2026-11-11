// Homework grading (ADR 0014) end to end on the live Postgres, with an injected
// grader instead of llmgw: what the sweep picks, retries, alerts, Grade again,
// what the parent and the child each see, the digest, settings and the backfill.

import type { ChildPhotoCheck, HomeworkGradeBrief, HomeworkGradeList } from "@homework/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { closeDb, db } from "../db/index.js";
import { setSetting } from "../db/queries.js";
import {
  children,
  homeworkGrades,
  homeworkItems,
  homeworkPhotos,
  settings,
  users,
} from "../db/schema.js";
import { seedSettings } from "../db/seed-settings.js";
import type { SessionUser } from "../middleware/auth.js";
import { toLocalIso } from "./digest.js";
import type { EmailContent } from "./email.js";
import type { GradeOutcome } from "./grader.js";
import {
  backfillGrades,
  gradesForDigest,
  loadGradingSettings,
  runGradingSweep,
  waitingSubmissions,
} from "./grading.js";
import type { GradingInput } from "./grading-prompt.js";
import { runNotifyCycle } from "./scheduler.js";

const url = process.env.DATABASE_URL;

let session: SessionUser | null = null;
const app = createApp({ resolveSession: async () => session });

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
const TODAY = toLocalIso(new Date());
const MIN = 60_000;

function send(method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function outcome(over: Partial<GradeOutcome> = {}): GradeOutcome {
  return {
    status: "graded",
    score: 90,
    summary: "Worksheet on reflections.",
    findings: [],
    stuck: false,
    retakeReason: null,
    retakePhotoIds: [],
    sheetTitle: null,
    model: "fake-model",
    photoIds: [],
    durationMs: 5,
    usage: null,
    error: null,
    ...over,
  };
}

describe.skipIf(!url)("homework grading (live DB)", () => {
  let parent: SessionUser;
  let ivyId: string;
  let ivy: SessionUser;
  let samId: string;
  let sent: EmailContent[];
  let graded: GradingInput[];
  let next: (input: GradingInput) => GradeOutcome;
  let now: Date;

  const deps = () => ({
    grade: async (input: GradingInput) => {
      graded.push(input);
      return next(input);
    },
    sendEmailImpl: async (_cfg: unknown, content: EmailContent) => {
      sent.push(content);
    },
    clock: () => now,
  });

  async function addItem(
    childId: string,
    title: string,
    submittedAt: Date | null,
    over: Partial<typeof homeworkItems.$inferInsert> = {},
  ): Promise<string> {
    const [row] = await db
      .insert(homeworkItems)
      .values({
        childId,
        title,
        kind: "homework",
        assignedOn: TODAY,
        dueOn: "2030-01-15",
        solutionNote: "Done",
        submittedAt,
        ...over,
      })
      .returning({ id: homeworkItems.id });
    if (!row) throw new Error("no item");
    await db.insert(homeworkPhotos).values({
      itemId: row.id,
      kind: "solution",
      contentType: "image/jpeg",
      byteSize: 68,
      bytes: JPEG,
    });
    return row.id;
  }

  async function enable(at: Date, alertBelow = 80) {
    await setSetting(db, "grading.enabled", "1");
    await setSetting(db, "grading.enabledAt", at.toISOString());
    await setSetting(db, "grading.alertBelow", String(alertBelow));
  }

  async function configureSmtp() {
    await setSetting(db, "smtp.host", "mail.example.com");
    await setSetting(db, "smtp.port", "587");
    await setSetting(db, "smtp.username", "u");
    await setSetting(db, "smtp.password", "p");
    await setSetting(db, "smtp.from", "homework@example.com");
    await setSetting(db, "smtp.to", "parent@example.com");
  }

  async function gradeRows(itemId: string) {
    return db.select().from(homeworkGrades).where(eq(homeworkGrades.itemId, itemId));
  }

  beforeEach(async () => {
    await db.delete(children);
    await db.delete(users);
    await db.delete(settings);
    await seedSettings(db);
    sent = [];
    graded = [];
    next = () => outcome();
    now = new Date();
    const [p] = await db
      .insert(users)
      .values({ name: "Parent", email: "parent@example.com", role: "parent" })
      .returning({ id: users.id });
    parent = {
      id: p?.id ?? "",
      name: "Parent",
      email: "parent@example.com",
      role: "parent",
      childId: null,
    };
    const [ivyRow] = await db
      .insert(children)
      .values({
        displayName: "Ivy",
        baseUrl: "https://x.example.com",
        username: "ivy@e.com",
        homeworkSource: "child",
      })
      .returning({ id: children.id });
    const [samRow] = await db
      .insert(children)
      .values({ displayName: "Sam", baseUrl: "https://x.example.com", username: "sam@e.com" })
      .returning({ id: children.id });
    ivyId = ivyRow?.id ?? "";
    samId = samRow?.id ?? "";
    const [login] = await db
      .insert(users)
      .values({ name: "Ivy", email: "ivy@example.com", role: "child", childId: ivyId })
      .returning({ id: users.id });
    ivy = {
      id: login?.id ?? "",
      name: "Ivy",
      email: "ivy@example.com",
      role: "child",
      childId: ivyId,
    };
    await configureSmtp();
  });

  afterAll(async () => {
    await db.delete(children);
    await db.delete(users);
    await closeDb();
  });

  it("does nothing while grading is off", async () => {
    await addItem(ivyId, "Packet", new Date(now.getTime() - 5 * MIN));
    const result = await runGradingSweep(db, deps());
    expect(result.graded).toBe(0);
    expect(graded).toHaveLength(0);
  });

  it("grades settled Submits made after it was turned on, for child-entry profiles only", async () => {
    await enable(new Date(now.getTime() - 60 * MIN));
    const settled = await addItem(ivyId, "Packet", new Date(now.getTime() - 2 * MIN));
    const fresh = await addItem(ivyId, "Just now", new Date(now.getTime() - 10_000));
    const before = await addItem(ivyId, "Old", new Date(now.getTime() - 120 * MIN));
    const open = await addItem(ivyId, "Not submitted", null);
    const samItem = await addItem(samId, "Sam's", new Date(now.getTime() - 2 * MIN));

    const result = await runGradingSweep(db, deps());
    expect(result.graded).toBe(1);
    expect(graded.map((g) => g.itemId)).toEqual([settled]);
    expect(graded[0]?.photos).toHaveLength(1);
    const [row] = await gradeRows(settled);
    expect(row?.status).toBe("graded");
    expect(row?.score).toBe(90);
    expect(row?.promptVersion).toBeGreaterThan(0);
    for (const id of [fresh, before, open, samItem]) expect(await gradeRows(id)).toHaveLength(0);

    // A second sweep finds nothing new; the fresh one once it settles.
    expect((await runGradingSweep(db, deps())).graded).toBe(0);
    now = new Date(now.getTime() + 2 * MIN);
    expect((await runGradingSweep(db, deps())).graded).toBe(1);
    expect(graded.map((g) => g.itemId)).toEqual([settled, fresh]);
  });

  it("emails the parent once when the score is low or photos must be retaken — not otherwise", async () => {
    await enable(new Date(now.getTime() - 60 * MIN), 80);
    const low = await addItem(ivyId, "Low", new Date(now.getTime() - 5 * MIN));
    const high = await addItem(ivyId, "High", new Date(now.getTime() - 4 * MIN));
    const retake = await addItem(ivyId, "Blurry", new Date(now.getTime() - 3 * MIN));
    const edge = await addItem(ivyId, "Edge", new Date(now.getTime() - 2 * MIN));
    const scores: Record<string, Partial<GradeOutcome>> = {
      [low]: {
        score: 58,
        findings: [
          {
            photoId: null,
            photoLabel: "Solution photo 1",
            question: "3",
            problem: "Sign flip",
            fix: "Swap x and y",
          },
        ],
      },
      [high]: { score: 92 },
      [retake]: { score: 95, retakeReason: "Photo 1 is blurry. Take it again." },
      [edge]: { score: 80 },
    };
    next = (input) => outcome(scores[input.itemId]);

    expect((await runGradingSweep(db, deps())).graded).toBe(4);
    expect(sent.map((m) => m.subject)).toEqual([
      "Ivy · Other · Low — 58/100, needs you",
      "Ivy · Other · Blurry — 95/100, retake some photos",
    ]);
    expect(sent[0]?.text).toContain("Q3: Sign flip → Swap x and y");
    expect(sent[0]?.html).toContain("/review/homework/");
    expect((await gradeRows(low))[0]?.alertedAt).not.toBeNull();
    expect((await gradeRows(high))[0]?.alertedAt).toBeNull();
    expect((await gradeRows(edge))[0]?.alertedAt).toBeNull();
    // Never twice.
    await runGradingSweep(db, deps());
    expect(sent).toHaveLength(2);
  });

  it("never alerts on not gradable or failed, and skips the email quietly without SMTP", async () => {
    await enable(new Date(now.getTime() - 60 * MIN));
    await addItem(ivyId, "On computer", new Date(now.getTime() - 3 * MIN));
    next = () => outcome({ status: "not_gradable", score: null });
    await runGradingSweep(db, deps());
    expect(sent).toHaveLength(0);

    await setSetting(db, "smtp.host", "");
    await addItem(ivyId, "Low, no SMTP", new Date(now.getTime() - 2 * MIN));
    next = () => outcome({ score: 10 });
    expect((await runGradingSweep(db, deps())).graded).toBe(1);
    expect(sent).toHaveLength(0);
  });

  it("retries a failed grade after 5 min, then 30 min, and stops after 3 tries", async () => {
    await enable(new Date(now.getTime() - 60 * MIN));
    const item = await addItem(ivyId, "Packet", new Date(now.getTime() - 2 * MIN));
    next = () => outcome({ status: "failed", score: null, summary: null, error: "llmgw: timeout" });

    await runGradingSweep(db, deps());
    expect(await gradeRows(item)).toHaveLength(1);
    now = new Date(now.getTime() + 4 * MIN);
    await runGradingSweep(db, deps());
    expect(await gradeRows(item)).toHaveLength(1); // still backing off
    now = new Date(now.getTime() + 2 * MIN);
    await runGradingSweep(db, deps());
    expect(await gradeRows(item)).toHaveLength(2);
    now = new Date(now.getTime() + 31 * MIN);
    await runGradingSweep(db, deps());
    expect(await gradeRows(item)).toHaveLength(3);
    now = new Date(now.getTime() + 300 * MIN);
    expect(await waitingSubmissions(db, await loadGradingSettings(db), now)).toHaveLength(0);
    expect(sent).toHaveLength(0);

    // The digest says it couldn't be graded, once the tries ran out.
    const digest = await gradesForDigest(db);
    expect(digest.lines.map((l) => [l.title, l.status])).toEqual([["Packet", "failed"]]);
  });

  it("grades a new Submit again; the list shows the current one", async () => {
    await enable(new Date(now.getTime() - 60 * MIN));
    const item = await addItem(ivyId, "Packet", new Date(now.getTime() - 3 * MIN));
    next = () => outcome({ score: 60, retakeReason: "Photo 1 is cut off. Take it again." });
    await runGradingSweep(db, deps());

    session = ivy;
    let list = (await (await send("GET", "/api/child/homework")).json()) as {
      items: { id: string; photoCheck: ChildPhotoCheck | null; grade?: unknown }[];
    };
    expect(list.items[0]?.photoCheck?.retake?.reason).toBe("Photo 1 is cut off. Take it again.");

    // She retakes and submits again: "checking", no banner until it's graded.
    const resubmitted = new Date(now.getTime() - 2 * MIN);
    await db
      .update(homeworkItems)
      .set({ submittedAt: resubmitted })
      .where(eq(homeworkItems.id, item));
    list = (await (await send("GET", "/api/child/homework")).json()) as typeof list;
    expect(list.items[0]?.photoCheck).toEqual({ retake: null, checking: true });

    next = () => outcome({ score: 88 });
    await runGradingSweep(db, deps());
    expect(await gradeRows(item)).toHaveLength(2);
    list = (await (await send("GET", "/api/child/homework")).json()) as typeof list;
    expect(list.items[0]?.photoCheck).toBeNull();

    session = parent;
    const parentList = (await (
      await send("GET", `/api/children/${ivyId}/homework-items`)
    ).json()) as { items: { grade: HomeworkGradeBrief | null }[] };
    expect(parentList.items[0]?.grade).toEqual({
      status: "graded",
      score: 88,
      needsParent: false,
      lowScore: false,
      retake: false,
    });
  });

  it("shows the child a retake request only — never the score, summary or findings", async () => {
    await enable(new Date(now.getTime() - 60 * MIN));
    const item = await addItem(ivyId, "Packet", new Date(now.getTime() - 3 * MIN));
    const pastDue = await addItem(ivyId, "Old one", new Date(now.getTime() - 2 * MIN), {
      assignedOn: "2020-01-01",
      dueOn: "2020-01-02",
    });
    next = () =>
      outcome({
        score: 41,
        summary: "SECRET SUMMARY",
        findings: [
          { photoId: null, photoLabel: null, question: "1", problem: "SECRET FINDING", fix: null },
        ],
        retakeReason: "Photo 1 is blurry. Take it again.",
      });
    await runGradingSweep(db, deps());

    session = ivy;
    const raw = await (await send("GET", "/api/child/homework")).text();
    expect(raw).not.toContain("SECRET");
    expect(raw).not.toContain('"score"');
    expect(raw).not.toContain('"grade"');
    const one = (await (await send("GET", `/api/child/homework/${item}`)).json()) as {
      photoCheck: ChildPhotoCheck;
    };
    expect(one.photoCheck.retake?.reason).toBe("Photo 1 is blurry. Take it again.");
    // Past its due day: no banner.
    const old = (await (await send("GET", `/api/child/homework/${pastDue}`)).json()) as {
      photoCheck: ChildPhotoCheck | null;
    };
    expect(old.photoCheck).toBeNull();
    // Her grade routes don't exist; the parent's are parent-only.
    expect((await send("GET", `/api/homework-items/${item}/grades`)).status).toBe(403);
  });

  it("Grade again: the parent's request is graded by the next sweep, without an alert", async () => {
    await enable(new Date(now.getTime() - 60 * MIN));
    const item = await addItem(ivyId, "Packet", new Date(now.getTime() - 3 * MIN));
    await runGradingSweep(db, deps());
    const open = await addItem(ivyId, "Open", null);

    session = parent;
    expect((await send("POST", `/api/homework-items/${open}/grade`)).status).toBe(409);
    const res = await send("POST", `/api/homework-items/${item}/grade`);
    expect(res.status).toBe(202);
    let grades = (await (
      await send("GET", `/api/homework-items/${item}/grades`)
    ).json()) as HomeworkGradeList;
    expect(grades.pending).toBe(true);

    next = () => outcome({ score: 20 });
    await runGradingSweep(db, deps());
    grades = (await (
      await send("GET", `/api/homework-items/${item}/grades`)
    ).json()) as HomeworkGradeList;
    expect(grades.pending).toBe(false);
    expect(grades.grades.map((g) => g.score)).toEqual([20, 90]);
    expect(grades.grades[0]?.needsParent).toBe(true);
    expect(sent).toHaveLength(0);
    const rows = await gradeRows(item);
    expect(rows.find((r) => r.score === 20)?.requestedBy).toBe(parent.id);
  });

  it("lists new grades in the daily digest once, then marks them reported", async () => {
    await enable(new Date(now.getTime() - 60 * MIN));
    await setSetting(db, "notify.refreshDigest.email", "1");
    await setSetting(db, "notify.fetchBeforeDispatch", "0");
    await addItem(ivyId, "Packet", new Date(now.getTime() - 3 * MIN));
    await addItem(ivyId, "Essay", new Date(now.getTime() - 2 * MIN));
    next = (input) =>
      outcome({ score: input.title === "Packet" ? 55 : 93, stuck: input.title === "Packet" });
    await runGradingSweep(db, deps());
    sent = [];

    const digestMails: EmailContent[] = [];
    const result = await runNotifyCycle(db, {
      sendEmailImpl: async (_cfg, content) => {
        digestMails.push(content);
      },
      now: () => now,
    });
    expect(result.sent).toBe(true);
    const text = digestMails[0]?.text ?? "";
    expect(text).toContain("Homework grades:");
    expect(text).toContain("Other · Packet · 55/100 (needs you) · stuck, alert sent");
    expect(text).toContain("Other · Essay · 93/100");
    expect(digestMails[0]?.html).toContain("Homework grades");

    await runNotifyCycle(db, {
      sendEmailImpl: async (_cfg, content) => {
        digestMails.push(content);
      },
      now: () => now,
    });
    expect(digestMails[1]?.text).toContain("Homework grades: no new grades");
  });

  it("saves the settings; turning grading on stamps when", async () => {
    session = parent;
    const defaults = (await (await send("GET", "/api/grading/settings")).json()) as Record<
      string,
      unknown
    >;
    expect(defaults).toMatchObject({
      enabled: false,
      enabledAt: null,
      model: "claude-sonnet-5-5",
      fallbackModel: "gpt-6-luna",
      alertBelow: 80,
    });
    const body = {
      enabled: true,
      model: "claude-opus-5-5",
      fallbackModel: "",
      alertBelow: 75,
      instructions: "8th grade",
      matchModel: "claude-haiku-5-5",
    };
    const saved = (await (await send("PUT", "/api/grading/settings", body)).json()) as {
      enabledAt: string | null;
    };
    expect(saved).toMatchObject({ ...body, enabled: true });
    expect(saved.enabledAt).not.toBeNull();
    // Saving again while on keeps the stamp.
    const again = (await (await send("PUT", "/api/grading/settings", body)).json()) as {
      enabledAt: string | null;
    };
    expect(again.enabledAt).toBe(saved.enabledAt);
    expect((await send("PUT", "/api/grading/settings", { ...body, alertBelow: 101 })).status).toBe(
      400,
    );
    session = ivy;
    expect((await send("GET", "/api/grading/settings")).status).toBe(403);
  });

  it("backfills older Submits quietly: no alerts, not in the next digest", async () => {
    await enable(new Date(now.getTime() + 60 * MIN)); // everything below is "before"
    await addItem(ivyId, "Old low", new Date(now.getTime() - 300 * MIN));
    await addItem(ivyId, "Old ok", new Date(now.getTime() - 200 * MIN));
    next = (input) => outcome({ score: input.title === "Old low" ? 30 : 95 });
    const result = await backfillGrades(db, deps());
    expect(result).toEqual({ graded: 2, failed: 0 });
    expect(sent).toHaveLength(0);
    expect((await gradesForDigest(db)).lines).toHaveLength(0);
    // Already graded: a second run does nothing.
    expect(await backfillGrades(db, deps())).toEqual({ graded: 0, failed: 0 });
  });
});
