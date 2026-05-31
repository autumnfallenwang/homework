// Pure attention engine — no platform imports. Ported verbatim from the desktop
// app (src/lib/core/attention-engine.ts); only the type import path changed
// (@/lib/scraper/types → ./domain.js). Lives in shared so the API and the web
// (M06) compute attention from one implementation.
//
// Computes attention flags bottom-up through the standards tree:
//   - classifyAssignment: per-assignment reason (missing | lowScore | null) + age
//   - computeClassAttention: walks one ClassDetails tree, rolls up per-standard
//     and per-class flags, emits a flat list of attention-worthy items
//   - computeChildAttention: aggregates across multiple classes for one child
//
// TeacherEase's M/P/B/PS rollup (Standard.score, isMeeting) is NOT touched —
// that's the "meeting" dimension and stays as the portal reports it. Our
// `!`/`✓` attention layer is orthogonal.

import type { Assignment, ClassDetails, Standard } from "./domain.js";

export interface AttentionConfig {
  /** Missing / low-score items older than this many weeks are "aged out" — they
   *  stop contributing to attention rollups but stay in the items list for the
   *  UI's "Older" collapsed group. */
  forgivenessWeeks: number;
  /** Strictly-less-than threshold. gradeNumeric == lowScoreThreshold is NOT
   *  attention-worthy (e.g. 3.0 = TeacherEase "Meeting" — don't flag Meeting). */
  lowScoreThreshold: number;
}

export const DEFAULT_FORGIVENESS_WEEKS = 2;
export const DEFAULT_LOW_SCORE_THRESHOLD = 3.0;
export const DEFAULT_ATTENTION_CONFIG: AttentionConfig = {
  forgivenessWeeks: DEFAULT_FORGIVENESS_WEEKS,
  lowScoreThreshold: DEFAULT_LOW_SCORE_THRESHOLD,
};

export type AttentionReason = "missing" | "lowScore";

export interface AssignmentAttention {
  reason: AttentionReason | null;
  /** Days since dueDate (positive = past due, negative = future-dated). `null`
   *  if dueDate is empty or unparseable. */
  ageDays: number | null;
  /** True if the item is still within the forgiveness window (or has no date).
   *  False iff it's aged out. */
  withinWindow: boolean;
}

export interface AttentionFlag {
  /** "attention" if any within-window item feeds this node; "clean" otherwise. */
  status: "clean" | "attention";
  /** Only meaningful when status=clean: true iff at least one aged-out item
   *  exists below. Lets the UI distinguish "truly nothing to see" from
   *  "resolved / too old to care about". */
  agedOutOnly: boolean;
}

export interface AttentionItem {
  reason: AttentionReason;
  assignment: Assignment;
  className: string;
  ageDays: number | null;
  withinWindow: boolean;
}

export interface StandardAttentionNode {
  name: string;
  flag: AttentionFlag;
  children: StandardAttentionNode[];
  /** Positionally aligned with the input Standard.assignments. */
  assignments: AssignmentAttention[];
}

export interface ClassAttentionResult {
  className: string;
  classFlag: AttentionFlag;
  standards: StandardAttentionNode[];
  /** Every attention-worthy assignment in the tree — both within-window and
   *  aged-out. Split by `withinWindow`. */
  items: AttentionItem[];
}

export interface ChildAttentionResult {
  childFlag: AttentionFlag;
  /** Parallel to the input `details` array. */
  perClass: ClassAttentionResult[];
  withinWindow: AttentionItem[];
  agedOut: AttentionItem[];
}

const MS_PER_DAY = 86_400_000;

/** Parse a due-date cell into days-since (positive past, negative future).
 *  Handles "M/D" (assumes `now`'s year — breaks across New Year; acceptable
 *  for in-term scraping per Q25 scope) and ISO datetimes. Returns null for
 *  empty/unparseable strings. */
function parseDueDateToAgeDays(dueDate: string | null | undefined, now: Date): number | null {
  if (!dueDate) return null;
  const trimmed = dueDate.trim();
  if (!trimmed) return null;
  const md = trimmed.match(/^(\d{1,2})\/(\d{1,2})$/);
  let parsed: Date | null;
  if (md) {
    const month = Number.parseInt(md[1] ?? "0", 10) - 1;
    const day = Number.parseInt(md[2] ?? "0", 10);
    parsed = new Date(now.getFullYear(), month, day, 0, 0, 0, 0);
  } else {
    const d = new Date(trimmed);
    parsed = Number.isNaN(d.getTime()) ? null : d;
  }
  if (!parsed) return null;
  return Math.floor((now.getTime() - parsed.getTime()) / MS_PER_DAY);
}

/** Union-merge a list of child flags into a single parent flag.  */
function rollUpFlag(flags: readonly AttentionFlag[]): AttentionFlag {
  let status: "clean" | "attention" = "clean";
  let agedOutOnly = false;
  for (const f of flags) {
    if (f.status === "attention") status = "attention";
    if (f.agedOutOnly) agedOutOnly = true;
  }
  // agedOutOnly is only meaningful when nothing fresh needs attention.
  if (status === "attention") agedOutOnly = false;
  return { status, agedOutOnly };
}

export function classifyAssignment(
  a: Assignment,
  now: Date,
  cfg: AttentionConfig,
): AssignmentAttention {
  const ageDays = parseDueDateToAgeDays(a.dueDate, now);
  const withinWindow = ageDays == null || ageDays <= cfg.forgivenessWeeks * 7;

  let reason: AttentionReason | null = null;
  if (a.isMissing) {
    // Missing wins over low-score when both happen to apply.
    reason = "missing";
  } else if (a.gradeNumeric > 0 && a.gradeNumeric < cfg.lowScoreThreshold) {
    // gradeNumeric == 0 is "ungraded" (no score entered yet) — NOT attention.
    reason = "lowScore";
  }

  return { reason, ageDays, withinWindow };
}

function computeStandardAttention(
  std: Standard,
  className: string,
  now: Date,
  cfg: AttentionConfig,
  itemsOut: AttentionItem[],
): StandardAttentionNode {
  const assignmentAttentions: AssignmentAttention[] = [];
  const assignmentFlags: AttentionFlag[] = [];

  for (const a of std.assignments) {
    const aa = classifyAssignment(a, now, cfg);
    assignmentAttentions.push(aa);

    if (aa.reason) {
      itemsOut.push({
        reason: aa.reason,
        assignment: a,
        className,
        ageDays: aa.ageDays,
        withinWindow: aa.withinWindow,
      });
      assignmentFlags.push(
        aa.withinWindow
          ? { status: "attention", agedOutOnly: false }
          : { status: "clean", agedOutOnly: true },
      );
    } else {
      assignmentFlags.push({ status: "clean", agedOutOnly: false });
    }
  }

  const childNodes: StandardAttentionNode[] = [];
  for (const c of std.children) {
    childNodes.push(computeStandardAttention(c, className, now, cfg, itemsOut));
  }

  const flag = rollUpFlag([...assignmentFlags, ...childNodes.map((c) => c.flag)]);

  return {
    name: std.name,
    flag,
    children: childNodes,
    assignments: assignmentAttentions,
  };
}

function dedupItemsByAssignment(items: readonly AttentionItem[]): AttentionItem[] {
  // TeacherEase data model lets a single assignment appear under multiple
  // standards in the same class, so the tree walk in computeStandardAttention
  // can push the same (className, testNameId) pair multiple times. Parents
  // should see one row per assignment, not N (also gives the UI stable
  // React keys). We keep the first occurrence — the item's attention state
  // is identical across duplicates, so "first" is arbitrary-but-consistent.
  const seen = new Set<string>();
  const out: AttentionItem[] = [];
  for (const item of items) {
    const key = `${item.className}::${item.assignment.testNameId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function computeClassAttention(
  detail: ClassDetails,
  now: Date,
  cfg: AttentionConfig = DEFAULT_ATTENTION_CONFIG,
): ClassAttentionResult {
  const items: AttentionItem[] = [];
  const standards: StandardAttentionNode[] = [];
  for (const std of detail.standards) {
    standards.push(computeStandardAttention(std, detail.className, now, cfg, items));
  }
  const classFlag = rollUpFlag(standards.map((s) => s.flag));
  return {
    className: detail.className,
    classFlag,
    standards,
    items: dedupItemsByAssignment(items),
  };
}

/** Parse raw setting strings (from the `settings` table) into an AttentionConfig.
 *  Missing / unparseable / out-of-range values fall back to defaults. Kept pure
 *  (no IPC / DB) so it's unit-testable alongside the engine. */
export function parseAttentionConfig(
  weeksRaw: string | null | undefined,
  thresholdRaw: string | null | undefined,
): AttentionConfig {
  const w = weeksRaw ? Number.parseFloat(weeksRaw) : Number.NaN;
  const t = thresholdRaw ? Number.parseFloat(thresholdRaw) : Number.NaN;
  return {
    forgivenessWeeks: Number.isFinite(w) && w >= 1 && w <= 12 ? w : DEFAULT_FORGIVENESS_WEEKS,
    lowScoreThreshold: Number.isFinite(t) && t >= 0 && t <= 4 ? t : DEFAULT_LOW_SCORE_THRESHOLD,
  };
}

/** Stable sort: missing rows render before lowScore rows. Per Q18 spec for
 *  the Attention section's within-group ordering. */
export function sortItemsMissingFirst(items: readonly AttentionItem[]): AttentionItem[] {
  return [...items].sort((a, b) => {
    if (a.reason === b.reason) return 0;
    return a.reason === "missing" ? -1 : 1;
  });
}

export function computeChildAttention(
  details: readonly ClassDetails[],
  now: Date,
  cfg: AttentionConfig = DEFAULT_ATTENTION_CONFIG,
): ChildAttentionResult {
  const perClass: ClassAttentionResult[] = [];
  const withinWindow: AttentionItem[] = [];
  const agedOut: AttentionItem[] = [];

  for (const d of details) {
    const r = computeClassAttention(d, now, cfg);
    perClass.push(r);
    for (const item of r.items) {
      if (item.withinWindow) withinWindow.push(item);
      else agedOut.push(item);
    }
  }

  const childFlag = rollUpFlag(perClass.map((c) => c.classFlag));
  return { childFlag, perClass, withinWindow, agedOut };
}
