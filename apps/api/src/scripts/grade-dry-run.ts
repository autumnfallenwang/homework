// Phase 0 of M13 (ADR 0014): grade real submitted items with one or more models
// and write a report — WITHOUT writing anything to the database (the connection
// is read only). Used to tune the prompt, pick the default model and the alert
// score before grading is switched on.
//
//   DATABASE_URL=… pnpm --filter @homework/api exec tsx src/scripts/grade-dry-run.ts \
//     --models claude-sonnet-5-5,claude-opus-5-5 --out /tmp/dry-run [--items id1,id2]
//     [--instructions "8th grade"]
//
// Writes <out>/report.md (for reading), <out>/results.json and the photos
// (<out>/photos/<id>.jpg) the report links to. Each model works through the items
// on its own; the models run side by side.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { asc, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema.js";
import { type GradeOutcome, gradeSubmission } from "../services/grader.js";
import { loadGradingInput } from "../services/grading-input.js";
import type { GradingInput } from "../services/grading-prompt.js";

const { values } = parseArgs({
  options: {
    models: { type: "string", default: "claude-sonnet-5-5" },
    out: { type: "string" },
    items: { type: "string" },
    instructions: { type: "string", default: "" },
    concurrency: { type: "string", default: "2" },
  },
});
if (!values.out || !process.env.DATABASE_URL) {
  console.error("usage: DATABASE_URL=… grade-dry-run.ts --out <dir> [--models a,b] [--items …]");
  process.exit(2);
}
const out = values.out;
const models = values.models
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const concurrency = Math.max(1, Number(values.concurrency) || 1);

// Read only: a stray write fails instead of touching real data.
const client = postgres(process.env.DATABASE_URL, {
  max: 2,
  connection: { default_transaction_read_only: true },
});
const db = drizzle(client, { schema, casing: "snake_case" });

const ids = values.items
  ? values.items.split(",").map((s) => s.trim())
  : (
      await db
        .select({ id: schema.homeworkItems.id })
        .from(schema.homeworkItems)
        .where(isNotNull(schema.homeworkItems.submittedAt))
        .orderBy(asc(schema.homeworkItems.assignedOn), asc(schema.homeworkItems.createdAt))
    ).map((r) => r.id);

const inputs: GradingInput[] = [];
for (const id of ids) {
  const input = await loadGradingInput(db as never, id, values.instructions);
  if (input) inputs.push(input);
}
await client.end();

mkdirSync(path.join(out, "photos"), { recursive: true });
for (const input of inputs) {
  for (const p of input.photos) {
    writeFileSync(path.join(out, "photos", `${p.id}.jpg`), p.bytes);
  }
}
console.log(`${inputs.length} items, ${models.length} model(s): ${models.join(", ")}`);

type Row = { itemId: string; model: string; outcome: GradeOutcome };
const results: Row[] = [];

async function runModel(model: string): Promise<void> {
  let next = 0;
  async function worker(): Promise<void> {
    while (next < inputs.length) {
      const input = inputs[next++] as GradingInput;
      const outcome = await gradeSubmission(input, { model, fallbackModel: "" });
      results.push({ itemId: input.itemId, model, outcome });
      console.log(
        `${model.padEnd(20)} ${input.className.padEnd(22)} ${input.title.slice(0, 28).padEnd(28)} ${outcome.status.padEnd(12)} ${outcome.score ?? ""} ${Math.round(outcome.durationMs / 1000)}s ${outcome.error ?? ""}`,
      );
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

await Promise.all(models.map((m) => runModel(m)));

writeFileSync(
  path.join(out, "results.json"),
  JSON.stringify(
    {
      inputs: inputs.map(({ photos, ...rest }) => ({
        ...rest,
        photos: photos.map((p) => ({ id: p.id, kind: p.kind })),
      })),
      results,
    },
    null,
    2,
  ),
);

const md: string[] = ["# Grading dry run", "", `Models: ${models.join(", ")}`, ""];
for (const input of inputs) {
  md.push(
    `## ${input.className} · ${input.title}`,
    "",
    `Given ${input.assignedOn}, due ${input.dueOn} · note: ${input.note ?? "(none)"} · photos: ${input.photos.map((p) => `[${p.kind}](photos/${p.id}.jpg)`).join(" ") || "none"}`,
    "",
  );
  for (const model of models) {
    const r = results.find((x) => x.itemId === input.itemId && x.model === model)?.outcome;
    if (!r) continue;
    md.push(
      `**${model}** — ${r.status}${r.score !== null ? ` ${r.score}` : ""}${r.stuck ? " · stuck" : ""} · ${Math.round(r.durationMs / 1000)}s${r.usage ? ` · ${r.usage.promptTokens}+${r.usage.completionTokens} tok` : ""}`,
      "",
      r.summary ? `> ${r.summary}` : "",
      r.retakeReason ? `Retake (${r.retakePhotoIds.length} photos): ${r.retakeReason}` : "",
      r.sheetTitle ? `Sheet title: ${r.sheetTitle}` : "",
      ...r.findings.map(
        (f) =>
          `- ${f.photoLabel ?? "?"}${f.question ? ` Q${f.question}` : ""}: ${f.problem}${f.fix ? ` → ${f.fix}` : ""}`,
      ),
      r.error ? `Error: ${r.error}` : "",
      "",
    );
  }
}
writeFileSync(
  path.join(out, "report.md"),
  md.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n"),
);
console.log(`report: ${path.join(out, "report.md")}`);
