// Phase 0 of M14: run teacher matching on real items WITHOUT writing anything —
// candidates from the latest TeacherEase fetch, the pick from the match model —
// and print the result. Sheet titles and summaries come from a grading dry run's
// results.json (M13 Phase 0), as the grades table would hold them.
//
//   DATABASE_URL=… tsx src/scripts/match-dry-run.ts --grades <dry-run>/results.json \
//     [--grader claude-sonnet-5-5] [--models claude-haiku-5-5,claude-sonnet-5-5]

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema.js";
import type { GradeOutcome } from "../services/grader.js";
import { candidatesFrom, matchWithModel, teacherRows } from "../services/teacher-match.js";

const { values } = parseArgs({
  options: {
    grades: { type: "string" },
    grader: { type: "string", default: "claude-sonnet-5-5" },
    models: { type: "string", default: "claude-haiku-5-5" },
  },
});
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(2);
}
const client = postgres(process.env.DATABASE_URL, {
  max: 2,
  connection: { default_transaction_read_only: true },
});
const db = drizzle(client, { schema, casing: "snake_case" });

const grades = new Map<string, GradeOutcome>();
if (values.grades) {
  const json = JSON.parse(readFileSync(values.grades, "utf8")) as {
    results: { itemId: string; model: string; outcome: GradeOutcome }[];
  };
  for (const r of json.results) if (r.model === values.grader) grades.set(r.itemId, r.outcome);
}

const items = await db
  .select({
    id: schema.homeworkItems.id,
    childId: schema.homeworkItems.childId,
    className: schema.childClasses.name,
    kind: schema.homeworkItems.kind,
    title: schema.homeworkItems.title,
    details: schema.homeworkItems.details,
    assignedOn: schema.homeworkItems.assignedOn,
    dueOn: schema.homeworkItems.dueOn,
    note: schema.homeworkItems.solutionNote,
  })
  .from(schema.homeworkItems)
  .leftJoin(schema.childClasses, eq(schema.childClasses.id, schema.homeworkItems.classId))
  .where(isNotNull(schema.homeworkItems.submittedAt))
  .orderBy(schema.homeworkItems.assignedOn);

const rowsByChild = new Map<string, Awaited<ReturnType<typeof teacherRows>>>();
for (const model of values.models.split(",").map((m) => m.trim())) {
  console.log(`\n## ${model}\n`);
  for (const item of items) {
    let rows = rowsByChild.get(item.childId);
    if (!rows) {
      rows = await teacherRows(db as never, item.childId);
      rowsByChild.set(item.childId, rows);
    }
    const cands = candidatesFrom(rows, item);
    const g = grades.get(item.id);
    const head = `${item.className ?? "Other"} · ${item.title} (due ${item.dueOn})`;
    if (cands.length === 0) {
      console.log(`- ${head}: no candidates`);
      continue;
    }
    try {
      const picks = await matchWithModel(
        {
          className: item.className ?? "Other",
          kind: item.kind,
          title: item.title,
          details: item.details,
          assignedOn: item.assignedOn,
          dueOn: item.dueOn,
          note: item.note,
          sheetTitle: g?.sheetTitle ?? null,
          gradeSummary: g?.summary ?? null,
        },
        cands,
        model,
      );
      const shown = picks
        .map((p) => {
          const c = cands.find((x) => x.teAssignmentId === p.teAssignmentId);
          return `${c?.assignmentName} [${p.confidence}] (${p.reason ?? ""})`;
        })
        .join("; ");
      console.log(
        `- ${head} [${cands.length} cand, sheet: ${g?.sheetTitle ?? "-"}]: ${shown || "none"}`,
      );
    } catch (err) {
      console.log(`- ${head}: ERROR ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
await client.end();
