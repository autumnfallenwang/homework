// Grade every submitted item that has no grade yet, quietly (ADR 0014, M13
// Phase 5): no alert emails, nothing in the next digest, and no retake banner
// for the child on items already past due. Then link them to the teacher's
// assignments (M14), also quietly. Run once around switching grading on, so the
// parent's lists show grades for the work entered before.
//
//   pnpm --filter @homework/api exec tsx --env-file=.env src/scripts/grade-backfill.ts
//   (in the cluster: kubectl exec deploy/homework-api -- node --import tsx src/scripts/grade-backfill.ts)

import { closeDb, db } from "../db/index.js";
import { getChildren } from "../db/queries.js";
import { log } from "../lib/logger.js";
import { backfillGrades } from "../services/grading.js";
import { runTeacherMatching } from "../services/teacher-match.js";

const result = await backfillGrades(db);
log.info(
  { event: "grading.backfill.done", graded: result.graded, failed: result.failed },
  "grading backfill finished",
);
// M14: link the graded items to the teacher's assignments, quietly — today's
// teacher scores count as already reported, so the next digest isn't a wall.
for (const child of await getChildren(db)) {
  if (child.homeworkSource !== "child") continue;
  // Everything she entered this school year, not just the last 30 days.
  const matched = await runTeacherMatching(db, child.id, {}, { quiet: true, lookbackDays: 365 });
  log.info(
    { event: "match.backfill.done", child_id: child.id, ...matched },
    "matching backfill finished",
  );
}
await closeDb();
