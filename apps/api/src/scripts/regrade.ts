// Grade again, quietly, every item whose current grade came from an older
// grading prompt (ADR 0016: prompt v3 writes Markdown + $LaTeX$, which the
// parent's page renders). No alert emails, nothing in the next digest.
//
//   kubectl exec -n homework deploy/homework-api -- node --import tsx src/scripts/regrade.ts
//   (--before <version>, default: the current prompt version)

import { parseArgs } from "node:util";
import { closeDb, db } from "../db/index.js";
import { log } from "../lib/logger.js";
import { regradeOlderPrompts } from "../services/grading.js";
import { GRADING_PROMPT_VERSION } from "../services/grading-prompt.js";

const { values } = parseArgs({ options: { before: { type: "string" } } });
const before = values.before ? Number(values.before) : GRADING_PROMPT_VERSION;
const result = await regradeOlderPrompts(db, before);
log.info({ event: "grading.regrade.done", before_version: before, ...result }, "regrade finished");
await closeDb();
