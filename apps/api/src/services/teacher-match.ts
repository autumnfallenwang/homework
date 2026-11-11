// Teacher-grade matching (M14): link a child's homework items to the teacher's
// TeacherEase assignments, so the parent sees the teacher's score beside the
// model's. No shared key exists — candidates come from code (same class by name,
// teacher's due date near hers), the pick from a small text model, the doubt
// from the parent. Runs after each TeacherEase fetch, only when an item's
// candidate set changed since its last try.

import { createHash } from "node:crypto";
import {
  addDaysIso,
  MATCH_LIMITS,
  type MatchConfidence,
  type TeacherBand,
  type TeacherGradeBrief,
  type TeacherLink,
  type TeacherMatchView,
  teacherBand,
  teacherDisagrees,
  teDueToIso,
} from "@homework/shared";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/index.js";
import { getLatestSuccessfulFetchRun } from "../db/queries.js";
import {
  assignments,
  childClasses,
  children,
  homeworkGrades,
  homeworkItemAssignments,
  homeworkItems,
  homeworkMatchAttempts,
} from "../db/schema.js";
import {
  type ChatMessage,
  type ChatRequest,
  type ChatResult,
  type ChatTool,
  chatCompletion,
  LlmError,
} from "../lib/llm.js";
import { log } from "../lib/logger.js";
import { loadGradingSettings } from "./grading.js";

export const MATCH_PROMPT_VERSION = 3;

/** Local-timezone ISO day (as the digest's toLocalIso; kept here to avoid an import cycle). */
function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const MATCH_TOOL_NAME = "record_matches";

// --- Candidates ------------------------------------------------------------------

export interface MatchCandidate {
  teAssignmentId: number;
  className: string;
  assignmentName: string;
  /** TeacherEase's "M/D". */
  dueDate: string | null;
  dueIso: string | null;
}

/** One teacher assignment row of a fetch, as candidates and score lookups need it. */
export interface TeacherRow {
  teAssignmentId: number | null;
  className: string;
  assignmentName: string;
  dueDate: string | null;
  score: string | null;
  scoreLetter: string | null;
  isMissing: boolean;
}

export async function teacherRows(db: Database, childId: string): Promise<TeacherRow[]> {
  const run = await getLatestSuccessfulFetchRun(db, childId, "teacherease");
  if (!run) return [];
  return db
    .select({
      teAssignmentId: assignments.teAssignmentId,
      className: assignments.className,
      assignmentName: assignments.assignmentName,
      dueDate: assignments.dueDate,
      score: assignments.score,
      scoreLetter: assignments.scoreLetter,
      isMissing: assignments.isMissing,
    })
    .from(assignments)
    .where(and(eq(assignments.fetchRunId, run.id), isNotNull(assignments.teAssignmentId)));
}

/** The teacher's assignments in the item's class (by name) due within 10 days of its due day. */
export function candidatesFrom(
  rows: readonly TeacherRow[],
  item: { className: string | null; dueOn: string },
): MatchCandidate[] {
  if (!item.className) return [];
  const cls = item.className.trim().toLowerCase();
  const from = addDaysIso(item.dueOn, -MATCH_LIMITS.dueDaysBefore);
  const to = addDaysIso(item.dueOn, MATCH_LIMITS.dueDaysAfter);
  const seen = new Set<number>();
  const out: MatchCandidate[] = [];
  for (const r of rows) {
    if (r.teAssignmentId === null || seen.has(r.teAssignmentId)) continue;
    if (r.className.trim().toLowerCase() !== cls) continue;
    const dueIso = teDueToIso(r.dueDate, item.dueOn);
    if (!dueIso || dueIso < from || dueIso > to) continue;
    seen.add(r.teAssignmentId);
    out.push({
      teAssignmentId: r.teAssignmentId,
      className: r.className,
      assignmentName: r.assignmentName,
      dueDate: r.dueDate,
      dueIso,
    });
  }
  return out.sort(
    (a, b) => (a.dueIso ?? "").localeCompare(b.dueIso ?? "") || a.teAssignmentId - b.teAssignmentId,
  );
}

export function candidatesHash(cands: readonly MatchCandidate[]): string {
  const key = cands
    .map((c) => `${c.teAssignmentId}|${c.assignmentName}|${c.dueDate ?? ""}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(`v${MATCH_PROMPT_VERSION}\n${key}`).digest("hex").slice(0, 32);
}

// --- The model --------------------------------------------------------------------

export interface MatchInput {
  className: string;
  kind: string;
  title: string;
  details: string | null;
  assignedOn: string;
  dueOn: string;
  note: string | null;
  /** From the item's latest grade: the title printed on the sheet, and what the photos showed. */
  sheetTitle: string | null;
  gradeSummary: string | null;
}

const SYSTEM_PROMPT = `You link a middle-school student's own homework entry to the teacher's gradebook in the same class. The student types short, informal names ("packet", "Google doc"); the teacher's names are formal ("#026 Discussion Reflection", "Stamp Act Documents"), and due dates can differ by a few days.

Decide which of the teacher's assignments listed (if any) are THE SAME piece of work as the student's entry, and record them with the ${MATCH_TOOL_NAME} tool.

- Same work only. Practice for a quiz is not the quiz; a study guide or a review packet is not the test; class notes are not a lab — unless the entry is that quiz, test or lab. Leave such related-but-different assignments out entirely (not even "medium").
- One entry can be several assignments (two tasks are sometimes listed in one entry, e.g. "edpuzzle and lingco"), and two entries can be one assignment.
- confidence "high": the title printed on the sheet, or a distinctive word or topic from the entry or note, matches the assignment's name, the dates fit, AND nothing in the entry points elsewhere. "medium": plausible from the topic and the date but the names are generic — or a name matches but the note or sheet describes a different topic than the assignment's name suggests (e.g. the note says a Blooket was about monuments while the assignment is "Blooket - futur" and another is "Paris monuments"). "low": a weak guess.
- Dates are a hint, not a rule: one due day is sometimes entered for two tasks given days apart.
- An empty list when nothing fits. Never pick an assignment that isn't listed.
- reason: a few words on why (e.g. "the note mentions the Stamp Act").`;

const MATCH_TOOL: ChatTool = {
  type: "function",
  function: {
    name: MATCH_TOOL_NAME,
    description: "Record which teacher assignments the entry is.",
    parameters: {
      type: "object",
      properties: {
        matches: {
          type: "array",
          items: {
            type: "object",
            properties: {
              assignment_id: { type: "integer" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              reason: { type: "string" },
            },
            required: ["assignment_id", "confidence", "reason"],
          },
        },
      },
      required: ["matches"],
    },
  },
};

export function buildMatchMessages(
  input: MatchInput,
  cands: readonly MatchCandidate[],
): ChatMessage[] {
  const entry = [
    `Class: ${input.className}`,
    `Type: ${input.kind}`,
    `The student called it: ${input.title}`,
    input.details ? `Details the student wrote: ${input.details}` : null,
    `Given on ${input.assignedOn}, due ${input.dueOn}`,
    `The student's note about the finished work: ${input.note ?? "(none)"}`,
    input.sheetTitle
      ? `Title printed on the sheet (read from the photos): ${input.sheetTitle}`
      : null,
    input.gradeSummary ? `What the photos showed: ${input.gradeSummary}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n");
  const list = cands
    .map(
      (c) =>
        `- id ${c.teAssignmentId}: "${c.assignmentName}" (due ${c.dueIso ?? c.dueDate ?? "?"})`,
    )
    .join("\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `The student's entry:\n${entry}\n\nThe teacher's assignments in ${input.className} due near then:\n${list}`,
    },
  ];
}

const answerSchema = z.object({
  matches: z
    .array(
      z.object({
        assignment_id: z.union([z.number(), z.string()]),
        confidence: z.enum(["high", "medium", "low"]),
        reason: z.string().nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
});

export interface MatchPick {
  teAssignmentId: number;
  confidence: MatchConfidence;
  reason: string | null;
}

/** The model's picks, limited to the candidates it was given. Throws on an unreadable answer. */
export function readMatchAnswer(result: ChatResult, cands: readonly MatchCandidate[]): MatchPick[] {
  const call = result.toolCalls.find((t) => t.name === MATCH_TOOL_NAME) ?? result.toolCalls[0];
  let raw: string | null = call?.arguments ?? null;
  if (!raw) {
    const content = result.content ?? "";
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    raw = start >= 0 && end > start ? content.slice(start, end + 1) : null;
  }
  if (!raw) throw new Error("the model did not record matches");
  const parsed = answerSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error("the model's matches did not fit the format");
  const ids = new Set(cands.map((c) => c.teAssignmentId));
  const picks = new Map<number, MatchPick>();
  for (const m of parsed.data.matches ?? []) {
    const id = Number(m.assignment_id);
    if (!ids.has(id)) continue;
    const rank = { high: 3, medium: 2, low: 1 } as const;
    const prior = picks.get(id);
    if (prior && rank[prior.confidence] >= rank[m.confidence]) continue;
    picks.set(id, {
      teAssignmentId: id,
      confidence: m.confidence,
      reason: m.reason?.trim() || null,
    });
  }
  return [...picks.values()];
}

export interface MatchDeps {
  chat?: (req: ChatRequest) => Promise<ChatResult>;
  /** Pick without llmgw (tests). */
  match?: (input: MatchInput, cands: readonly MatchCandidate[]) => Promise<MatchPick[]>;
  clock?: () => Date;
}

/** Ask the model; one more try on an unreadable answer. */
export async function matchWithModel(
  input: MatchInput,
  cands: readonly MatchCandidate[],
  model: string,
  deps: MatchDeps = {},
): Promise<MatchPick[]> {
  const chat = deps.chat ?? ((req: ChatRequest) => chatCompletion(req, { timeoutMs: 90_000 }));
  const messages = buildMatchMessages(input, cands);
  let last: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await chat({
        model,
        messages,
        tools: [MATCH_TOOL],
        tool_choice: { type: "function", function: { name: MATCH_TOOL_NAME } },
      });
      return readMatchAnswer(result, cands);
    } catch (err) {
      last = err;
      if (err instanceof LlmError) break;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

// --- Running after a fetch ------------------------------------------------------

export interface MatchRunResult {
  asked: number;
  linked: number;
  suggested: number;
  failed: number;
}

interface ItemForMatch {
  id: string;
  className: string | null;
  kind: string;
  title: string;
  details: string | null;
  assignedOn: string;
  dueOn: string;
  note: string | null;
}

/**
 * Match one child's recent submitted items whose candidates changed since the
 * last try. `quiet`: links get the teacher's current score as already reported
 * (the release backfill — no wall of "teacher graded" lines in the next digest).
 */
export async function runTeacherMatching(
  db: Database,
  childId: string,
  deps: MatchDeps = {},
  opts: { quiet?: boolean; lookbackDays?: number } = {},
): Promise<MatchRunResult> {
  const result: MatchRunResult = { asked: 0, linked: 0, suggested: 0, failed: 0 };
  const settings = await loadGradingSettings(db);
  const clock = deps.clock ?? (() => new Date());
  const today = localIso(clock());
  const rows = await teacherRows(db, childId);
  if (rows.length === 0) return result;

  const items: ItemForMatch[] = await db
    .select({
      id: homeworkItems.id,
      className: childClasses.name,
      kind: homeworkItems.kind,
      title: homeworkItems.title,
      details: homeworkItems.details,
      assignedOn: homeworkItems.assignedOn,
      dueOn: homeworkItems.dueOn,
      note: homeworkItems.solutionNote,
    })
    .from(homeworkItems)
    .innerJoin(children, eq(children.id, homeworkItems.childId))
    .leftJoin(childClasses, eq(childClasses.id, homeworkItems.classId))
    .where(
      and(
        eq(homeworkItems.childId, childId),
        eq(children.homeworkSource, "child"),
        isNotNull(homeworkItems.submittedAt),
        gte(
          homeworkItems.dueOn,
          addDaysIso(today, -(opts.lookbackDays ?? MATCH_LIMITS.lookbackDays)),
        ),
      ),
    );

  for (const item of items) {
    const cands = candidatesFrom(rows, item);
    if (cands.length === 0) continue;
    const hash = candidatesHash(cands);
    const [last] = await db
      .select({ hash: homeworkMatchAttempts.candidatesHash, error: homeworkMatchAttempts.error })
      .from(homeworkMatchAttempts)
      .where(eq(homeworkMatchAttempts.itemId, item.id))
      .orderBy(desc(homeworkMatchAttempts.at))
      .limit(1);
    if (last && last.hash === hash && last.error === null) continue;

    const [grade] = await db
      .select({ sheetTitle: homeworkGrades.sheetTitle, summary: homeworkGrades.summary })
      .from(homeworkGrades)
      .where(and(eq(homeworkGrades.itemId, item.id), sql`${homeworkGrades.status} <> 'failed'`))
      .orderBy(desc(homeworkGrades.createdAt))
      .limit(1);
    const input: MatchInput = {
      className: item.className ?? "Other",
      kind: item.kind,
      title: item.title,
      details: item.details,
      assignedOn: item.assignedOn,
      dueOn: item.dueOn,
      note: item.note,
      sheetTitle: grade?.sheetTitle ?? null,
      gradeSummary: grade?.summary ?? null,
    };

    result.asked += 1;
    let picks: MatchPick[];
    try {
      picks = deps.match
        ? await deps.match(input, cands)
        : await matchWithModel(input, cands, settings.matchModel, deps);
    } catch (err) {
      result.failed += 1;
      const error = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      await db
        .insert(homeworkMatchAttempts)
        .values({ itemId: item.id, candidatesHash: hash, model: settings.matchModel, error });
      log.warn({ event: "match.failed", item_id: item.id, error }, "teacher matching failed");
      continue;
    }
    const applied = await applyPicks(db, item.id, cands, picks, rows, opts.quiet === true);
    result.linked += applied.linked;
    result.suggested += applied.suggested;
    await db
      .insert(homeworkMatchAttempts)
      .values({ itemId: item.id, candidatesHash: hash, model: settings.matchModel, error: null });
    log.info(
      {
        event: "match.done",
        item_id: item.id,
        candidates: cands.length,
        linked: applied.linked,
        suggested: applied.suggested,
        model: settings.matchModel,
      },
      "teacher matching done",
    );
  }
  return result;
}

function currentScore(rows: readonly TeacherRow[], teId: number): string | null {
  const r = rows.find((x) => x.teAssignmentId === teId);
  return r?.score?.trim() || (r?.isMissing ? "Missing" : null);
}

/** Store the picks: high → linked, medium → suggested, low → nothing; the parent's word stands. */
async function applyPicks(
  db: Database,
  itemId: string,
  cands: readonly MatchCandidate[],
  picks: readonly MatchPick[],
  rows: readonly TeacherRow[],
  quiet: boolean,
): Promise<{ linked: number; suggested: number }> {
  const existing = await db
    .select()
    .from(homeworkItemAssignments)
    .where(eq(homeworkItemAssignments.itemId, itemId));
  const byId = new Map(existing.map((e) => [e.teAssignmentId, e]));
  let linked = 0;
  let suggested = 0;
  const keep = new Set<number>();
  for (const p of picks) {
    if (p.confidence === "low") continue;
    const cand = cands.find((c) => c.teAssignmentId === p.teAssignmentId);
    if (!cand) continue;
    keep.add(p.teAssignmentId);
    const prior = byId.get(p.teAssignmentId);
    // The parent's word is final: a rejection, a confirmation or their own pick.
    if (prior && (prior.state === "rejected" || prior.source === "parent")) continue;
    const state = p.confidence === "high" ? "confirmed" : "suggested";
    const values = {
      itemId,
      teAssignmentId: p.teAssignmentId,
      className: cand.className,
      assignmentName: cand.assignmentName,
      dueDate: cand.dueDate,
      confidence: p.confidence,
      reason: p.reason,
      source: "model" as const,
      state,
      teacherReportedScore: quiet ? currentScore(rows, p.teAssignmentId) : null,
      updatedAt: new Date(),
    };
    await db
      .insert(homeworkItemAssignments)
      .values(values)
      .onConflictDoUpdate({
        target: [homeworkItemAssignments.itemId, homeworkItemAssignments.teAssignmentId],
        set: {
          confidence: values.confidence,
          reason: values.reason,
          state: values.state,
          updatedAt: values.updatedAt,
        },
      });
    if (state === "confirmed") linked += 1;
    else suggested += 1;
  }
  // The model's own earlier links it no longer makes go (the latest run, with the
  // most assignments posted, decides); the parent's links and rejections stay.
  const stale = existing
    .filter((e) => e.source === "model" && e.state !== "rejected" && !keep.has(e.teAssignmentId))
    .map((e) => e.id);
  if (stale.length > 0) {
    await db.delete(homeworkItemAssignments).where(inArray(homeworkItemAssignments.id, stale));
  }
  return { linked, suggested };
}

// --- What the parent sees and does -------------------------------------------------

async function itemBasics(db: Database, itemId: string) {
  const [row] = await db
    .select({
      childId: homeworkItems.childId,
      className: childClasses.name,
      dueOn: homeworkItems.dueOn,
    })
    .from(homeworkItems)
    .leftJoin(childClasses, eq(childClasses.id, homeworkItems.classId))
    .where(eq(homeworkItems.id, itemId));
  return row ?? null;
}

function toLink(
  row: typeof homeworkItemAssignments.$inferSelect,
  rows: readonly TeacherRow[],
): TeacherLink {
  const t = rows.find((r) => r.teAssignmentId === row.teAssignmentId);
  const score = t?.score?.trim() || (t?.isMissing ? "Missing" : null);
  return {
    teAssignmentId: row.teAssignmentId,
    assignmentName: row.assignmentName,
    className: row.className,
    dueDate: row.dueDate,
    confidence: (row.confidence as MatchConfidence | null) ?? null,
    reason: row.reason,
    source: row.source as "model" | "parent",
    state: row.state as TeacherLink["state"],
    score,
    band: t ? teacherBand(t.score, t.scoreLetter, t.isMissing) : null,
  };
}

/** The item's links (not the rejected ones) and the candidates to pick from. */
export async function teacherView(db: Database, itemId: string): Promise<TeacherMatchView | null> {
  const item = await itemBasics(db, itemId);
  if (!item) return null;
  const rows = await teacherRows(db, item.childId);
  const links = await db
    .select()
    .from(homeworkItemAssignments)
    .where(eq(homeworkItemAssignments.itemId, itemId))
    .orderBy(homeworkItemAssignments.createdAt);
  return {
    links: links.filter((l) => l.state !== "rejected").map((l) => toLink(l, rows)),
    candidates: candidatesFrom(rows, item).map((c) => ({
      teAssignmentId: c.teAssignmentId,
      assignmentName: c.assignmentName,
      dueDate: c.dueDate,
    })),
  };
}

export class TeacherMatchError extends Error {
  constructor(readonly code: "item_not_found" | "not_a_candidate" | "link_not_found") {
    super(code);
  }
}

/** The parent confirms or rejects a link — final either way (later model runs leave it alone). */
export async function setTeacherLinkState(
  db: Database,
  itemId: string,
  teAssignmentId: number,
  state: "confirmed" | "rejected",
): Promise<void> {
  const updated = await db
    .update(homeworkItemAssignments)
    .set({ state, source: state === "confirmed" ? "parent" : undefined, updatedAt: new Date() })
    .where(
      and(
        eq(homeworkItemAssignments.itemId, itemId),
        eq(homeworkItemAssignments.teAssignmentId, teAssignmentId),
      ),
    )
    .returning({ id: homeworkItemAssignments.id });
  if (updated.length === 0) throw new TeacherMatchError("link_not_found");
}

/** The parent picks an assignment from the candidates ("Pick another"). */
export async function pickTeacherLink(
  db: Database,
  itemId: string,
  teAssignmentId: number,
): Promise<void> {
  const item = await itemBasics(db, itemId);
  if (!item) throw new TeacherMatchError("item_not_found");
  const cand = candidatesFrom(await teacherRows(db, item.childId), item).find(
    (c) => c.teAssignmentId === teAssignmentId,
  );
  if (!cand) throw new TeacherMatchError("not_a_candidate");
  await db
    .insert(homeworkItemAssignments)
    .values({
      itemId,
      teAssignmentId,
      className: cand.className,
      assignmentName: cand.assignmentName,
      dueDate: cand.dueDate,
      confidence: null,
      reason: null,
      source: "parent",
      state: "confirmed",
    })
    .onConflictDoUpdate({
      target: [homeworkItemAssignments.itemId, homeworkItemAssignments.teAssignmentId],
      set: { state: "confirmed", source: "parent", updatedAt: new Date() },
    });
}

/** The teacher's score per list row (parent): the first graded link, else nothing. */
export async function teacherBriefs(
  db: Database,
  items: readonly { id: string; childId: string }[],
): Promise<Map<string, TeacherGradeBrief | null>> {
  const out = new Map<string, TeacherGradeBrief | null>();
  if (items.length === 0) return out;
  const links = await db
    .select()
    .from(homeworkItemAssignments)
    .where(
      and(
        inArray(
          homeworkItemAssignments.itemId,
          items.map((i) => i.id),
        ),
        sql`${homeworkItemAssignments.state} <> 'rejected'`,
      ),
    )
    .orderBy(homeworkItemAssignments.createdAt);
  const rowsByChild = new Map<string, TeacherRow[]>();
  for (const childId of new Set(items.map((i) => i.childId))) {
    if (links.length > 0) rowsByChild.set(childId, await teacherRows(db, childId));
  }
  for (const item of items) {
    const rows = rowsByChild.get(item.childId) ?? [];
    const scored = links
      .filter((l) => l.itemId === item.id)
      .map((l) => toLink(l, rows))
      .filter((l): l is TeacherLink & { score: string; band: TeacherBand } => !!l.score && !!l.band)
      .sort((a, b) => Number(a.state !== "confirmed") - Number(b.state !== "confirmed"));
    const first = scored[0];
    out.set(
      item.id,
      first
        ? { score: first.score, band: first.band, probable: first.state !== "confirmed" }
        : null,
    );
  }
  return out;
}

// --- The daily digest ------------------------------------------------------------

export interface TeacherDigestLine {
  childId: string;
  itemId: string;
  itemTitle: string;
  className: string;
  assignmentName: string;
  score: string;
  band: TeacherBand;
  /** Only suggested so far. */
  probable: boolean;
  modelScore: number | null;
  disagree: "teacher_lower" | "teacher_higher" | null;
}

export interface TeacherDigest {
  lines: TeacherDigestLine[];
  /** Mark these reported (link id → the score now shown) once the digest is sent. */
  reported: { id: string; score: string }[];
}

/** Linked assignments whose teacher score is new or changed since the last digest. */
export async function teacherLinesForDigest(db: Database): Promise<TeacherDigest> {
  const settings = await loadGradingSettings(db);
  const links = await db
    .select({
      link: homeworkItemAssignments,
      childId: homeworkItems.childId,
      itemTitle: homeworkItems.title,
    })
    .from(homeworkItemAssignments)
    .innerJoin(homeworkItems, eq(homeworkItems.id, homeworkItemAssignments.itemId))
    .where(sql`${homeworkItemAssignments.state} <> 'rejected'`)
    .orderBy(homeworkItemAssignments.createdAt);
  const out: TeacherDigest = { lines: [], reported: [] };
  const rowsByChild = new Map<string, TeacherRow[]>();
  for (const { link, childId, itemTitle } of links) {
    let rows = rowsByChild.get(childId);
    if (!rows) {
      rows = await teacherRows(db, childId);
      rowsByChild.set(childId, rows);
    }
    const t = toLink(link, rows);
    if (!t.score || !t.band || t.score === link.teacherReportedScore) continue;
    const [grade] = await db
      .select({ score: homeworkGrades.score })
      .from(homeworkGrades)
      .where(and(eq(homeworkGrades.itemId, link.itemId), eq(homeworkGrades.status, "graded")))
      .orderBy(desc(homeworkGrades.createdAt))
      .limit(1);
    const modelScore = grade?.score ?? null;
    out.lines.push({
      childId,
      itemId: link.itemId,
      itemTitle,
      className: link.className,
      assignmentName: link.assignmentName,
      score: t.score,
      band: t.band,
      probable: link.state !== "confirmed",
      modelScore,
      disagree: teacherDisagrees(t.band, modelScore, settings.alertBelow),
    });
    out.reported.push({ id: link.id, score: t.score });
  }
  return out;
}

export async function markTeacherReported(
  db: Database,
  reported: readonly { id: string; score: string }[],
): Promise<void> {
  for (const r of reported) {
    await db
      .update(homeworkItemAssignments)
      .set({ teacherReportedScore: r.score })
      .where(eq(homeworkItemAssignments.id, r.id));
  }
}
