import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../db/schema.js";
import { children, classes, fetchRuns, grades, homework, rawPayloads } from "../db/schema.js";
import type { FetchImpl } from "../scraper/types.js";
import { runFetch } from "./run-fetch.js";

// Gated integration test — needs a live Postgres with the schema migrated.
// Feeds canned HTML through a fake transport into the real runFetch → Drizzle,
// proving orchestration + persistence without the real portal.
const url = process.env.DATABASE_URL;
const client = postgres(url ?? "postgres://invalid");
const db = drizzle(client, { schema, casing: "snake_case" });

const GRADES_BLOB =
  '<html><script>var x = {"data":{"Data":[' +
  '{"ClassDescription":"Math 7","GradeStatus":{"Status":2},' +
  '"Progress":{"LearningTargetsMeeting":3,"LearningTargetsNotMeeting":1,"TotalLeafLearningTargets":5},' +
  '"InstructorDescription":["Instructor One"],"ClassID":1,"CurrentCGPID":11}' +
  '],"Total":1}};</script></html>';

const CLASS_HTML = `<html><body>
  <ul class="root-standard-item"><li>
    <div class="standard-item-data">
      <span class="standard-item-desc">Reading</span>
      <span class="standard-item-score-inner">3.5=M</span>
    </div>
    <div class="divAsnContainer">
      <table class="assignmentTable"><tbody>
        <tr data-testnameid="100" data-bmissing="1">
          <td>4/15</td><td><a href="#">Essay</a></td><td>1</td><td><img title="Missing"/></td>
        </tr>
      </tbody></table>
    </div>
  </li></ul>
</body></html>`;

const HOMEWORK_HTML =
  '<html><body><div class="hJDwNd-AhqUyc-uQSCkd">' +
  "Homework for 4/14/26Math:Packet #2Due: Wednesday 4/15" +
  "</div></body></html>";

function fakeResponse(body: string, init?: { status?: number; url?: string }): Response {
  return {
    status: init?.status ?? 200,
    ok: (init?.status ?? 200) < 400,
    url: init?.url ?? "https://x.example.com/",
    type: "basic",
    text: async () => body,
    headers: { getSetCookie: () => [] },
  } as unknown as Response;
}

/** Fake transport: routes by URL/method to canned HTML. `loginOk` toggles the
 *  POST result between a 302 (success) and a bounce-back (bad credentials). */
function makeFetch(loginOk: boolean): FetchImpl {
  return async (u, init) => {
    const s = u.toString();
    if (s.includes("/common/login.aspx")) return fakeResponse("<form></form>");
    if (s.includes("/app/Login/Login")) {
      return loginOk
        ? fakeResponse("", { status: 302 })
        : fakeResponse("", { status: 200, url: "https://x.example.com/common/login.aspx" });
    }
    if (s.includes("GradeViewAllWithProgress")) return fakeResponse(GRADES_BLOB);
    if (s.includes("StudentProgressStandardsDetails")) return fakeResponse(CLASS_HTML);
    if (s.includes("/homework")) return fakeResponse(HOMEWORK_HTML);
    void init;
    return fakeResponse("not found", { status: 404 });
  };
}

async function makeChild(homeworkUrl: string | null) {
  const [row] = await db
    .insert(children)
    .values({
      displayName: "Test Kid",
      baseUrl: "https://x.example.com",
      username: "u@e.com",
      portalPassword: "secret",
      homeworkUrl,
    })
    .returning();
  return row!;
}

describe.skipIf(!url)("runFetch integration (live DB)", () => {
  beforeEach(async () => {
    await db.delete(children); // cascade clears everything downstream
  });

  afterAll(async () => {
    await db.delete(children);
    await client.end();
  });

  it("persists a full fetch_run graph for a successful scrape", async () => {
    const child = await makeChild("https://sites.google.com/homework");
    const summary = await runFetch(child.id, { db, fetchImpl: makeFetch(true) });

    expect(summary).toMatchObject({ successes: 2, failures: 0 });

    const runs = await db.select().from(fetchRuns).where(eq(fetchRuns.childId, child.id));
    expect(runs).toHaveLength(2);
    expect(runs.every((r) => r.status === "success")).toBe(true);

    const teRun = runs.find((r) => r.source === "teacherease")!;
    const payload = await db.select().from(rawPayloads).where(eq(rawPayloads.fetchRunId, teRun.id));
    expect(payload).toHaveLength(1);
    // jsonb round-trips as an object, not a string.
    const stored = payload[0]?.payload as { overview: { classes: unknown[] } };
    expect(stored.overview.classes).toHaveLength(1);

    const cls = await db.select().from(classes).where(eq(classes.childId, child.id));
    expect(cls).toHaveLength(1);
    expect(cls[0]?.teClassId).toBe(1);

    const gradeRows = await db.select().from(grades).where(eq(grades.fetchRunId, teRun.id));
    expect(gradeRows).toHaveLength(1);
    expect(gradeRows[0]?.needsAttention).toBe(true);

    const hw = await db.select().from(homework).where(eq(homework.childId, child.id));
    expect(hw).toHaveLength(1);
    expect(hw[0]?.subject).toBe("Math");
  });

  it("upserts classes + homework on a second run (no duplicates)", async () => {
    const child = await makeChild("https://sites.google.com/homework");
    await runFetch(child.id, { db, fetchImpl: makeFetch(true) });
    await runFetch(child.id, { db, fetchImpl: makeFetch(true) });

    const cls = await db.select().from(classes).where(eq(classes.childId, child.id));
    expect(cls).toHaveLength(1); // upsert on (childId, teClassId)
    const hw = await db.select().from(homework).where(eq(homework.childId, child.id));
    expect(hw).toHaveLength(1); // upsert on (childId, hwDate, subject)
    const runs = await db.select().from(fetchRuns).where(eq(fetchRuns.childId, child.id));
    expect(runs).toHaveLength(4); // each run snapshots its own fetch_runs rows
  });

  it("records a failed teacherease run on bad credentials", async () => {
    const child = await makeChild(null); // homework skipped
    const summary = await runFetch(child.id, { db, fetchImpl: makeFetch(false) });

    expect(summary.failures).toBe(1);
    const runs = await db.select().from(fetchRuns).where(eq(fetchRuns.childId, child.id));
    const teRun = runs.find((r) => r.source === "teacherease")!;
    expect(teRun.status).toBe("failed");
    expect(teRun.errorMessage).toContain("badCredentials");
  });
});
