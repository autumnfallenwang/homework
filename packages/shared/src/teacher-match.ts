// Her homework items linked to the teacher's TeacherEase assignments (M14). There
// is no shared key — names differ and dates drift — so a small model proposes
// links after each fetch and the parent confirms the unsure ones. Shapes and
// rules shared by API and web.

import { z } from "zod";

export type MatchConfidence = "high" | "medium" | "low";
export type TeacherLinkState = "suggested" | "confirmed" | "rejected";

/** What a TeacherEase score says, in a word. */
export type TeacherBand =
  | "meets"
  | "progressing"
  | "beginning"
  | "missing"
  | "late"
  | "excused"
  | "handed_in"
  | "other";

export interface TeacherLink {
  teAssignmentId: number;
  assignmentName: string;
  className: string;
  /** TeacherEase's own "M/D". */
  dueDate: string | null;
  confidence: MatchConfidence | null;
  reason: string | null;
  source: "model" | "parent";
  state: TeacherLinkState;
  /** The teacher's score from the latest fetch ("3=M", "Missing"), null = not graded yet. */
  score: string | null;
  band: TeacherBand | null;
}

export interface TeacherCandidate {
  teAssignmentId: number;
  assignmentName: string;
  dueDate: string | null;
}

/** GET /api/homework-items/:id/teacher */
export interface TeacherMatchView {
  links: TeacherLink[];
  /** The teacher's assignments in this class due near hers, for "Pick another". */
  candidates: TeacherCandidate[];
}

/** On a list row (parent): the teacher's score for a linked item. */
export interface TeacherGradeBrief {
  score: string;
  band: TeacherBand;
  /** Only a suggestion so far. */
  probable: boolean;
}

export const teacherLinkStateSchema = z.object({ state: z.enum(["confirmed", "rejected"]) });
export const teacherLinkPickSchema = z.object({ teAssignmentId: z.number().int().positive() });

export const MATCH_LIMITS = {
  /**
   * Candidates: the teacher's due date within 10 days of hers either way — she
   * bundles tasks under one due day (Lingco due 10/7 inside "edpuzzle and lingco"
   * due 10/14) and the teacher's can be days later (Stamp Act: 10/15 vs 10/20).
   */
  dueDaysBefore: 10,
  dueDaysAfter: 10,
  /** Items are matched for this long after their due day. */
  lookbackDays: 30,
} as const;

/**
 * "3=M" → meets, "2.5=P" → progressing, "1=PS" / "1=B" → beginning, "Missing",
 * "Assignment Turned In Late", "Excused", "Handed In"; null when not graded yet.
 */
export function teacherBand(
  score: string | null | undefined,
  letter?: string | null,
  isMissing = false,
): TeacherBand | null {
  if (isMissing) return "missing";
  const s = (score ?? "").trim();
  const l = (letter ?? s.split("=")[1] ?? "").trim().toUpperCase();
  if (l === "M" || l === "E") return "meets";
  if (l === "P") return "progressing";
  if (l === "PS" || l === "B") return "beginning";
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.includes("missing")) return "missing";
  if (lower.includes("late")) return "late";
  if (lower.includes("excused")) return "excused";
  if (lower.includes("handed in")) return "handed_in";
  return "other";
}

/** "M", "P", "B", "Missing", "Late", … — for a chip. */
export function teacherShortLabel(band: TeacherBand, score: string): string {
  switch (band) {
    case "meets":
      return "M";
    case "progressing":
      return "P";
    case "beginning":
      return "B";
    case "missing":
      return "Missing";
    case "late":
      return "Late";
    case "excused":
      return "Excused";
    case "handed_in":
      return "Handed in";
    default:
      return score;
  }
}

/**
 * TeacherEase's "M/D" as an ISO day, in the year that puts it nearest `near`
 * (an ISO day) — the gradebook has no year.
 */
export function teDueToIso(md: string | null | undefined, near: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec((md ?? "").trim());
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const nearMs = Date.parse(`${near}T00:00:00Z`);
  if (Number.isNaN(nearMs)) return null;
  const nearYear = new Date(nearMs).getUTCFullYear();
  let best: { iso: string; diff: number } | null = null;
  for (const year of [nearYear - 1, nearYear, nearYear + 1]) {
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCMonth() !== month - 1) continue;
    const diff = Math.abs(d.getTime() - nearMs);
    if (!best || diff < best.diff) best = { iso: d.toISOString().slice(0, 10), diff };
  }
  return best?.iso ?? null;
}

/**
 * The teacher and the model disagree: the model's score is fine but the teacher
 * gave P / B / Missing, or the model's is low but the teacher gave M.
 */
export function teacherDisagrees(
  band: TeacherBand | null,
  modelScore: number | null,
  alertBelow: number,
): "teacher_lower" | "teacher_higher" | null {
  if (band === null || modelScore === null) return null;
  const modelLow = modelScore < alertBelow;
  if (!modelLow && (band === "progressing" || band === "beginning" || band === "missing")) {
    return "teacher_lower";
  }
  if (modelLow && band === "meets") return "teacher_higher";
  return null;
}
