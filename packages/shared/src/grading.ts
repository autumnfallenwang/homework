// Homework grading (ADR 0014): every Submit of a child-entered item is graded by
// a vision model through llmgw. The parent sees the grade (and is emailed for a
// low score); the child sees only a retake request (which photos, and why).
// Shapes and rules shared by API and web.

import { z } from "zod";

/** What a grade row says about one submission. */
export const gradeStatusSchema = z.enum(["graded", "retake", "not_gradable", "failed"]);
export type GradeStatus = z.infer<typeof gradeStatusSchema>;

export const GRADING_LIMITS = {
  /** A submission is graded once it has been left alone this long (she may re-Submit). */
  settleMs: 60_000,
  /** Tries per submission; the fallback model runs inside each try. */
  maxAttempts: 3,
  /** Wait after the 1st and 2nd failed try before the next one. */
  retryAfterMs: [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000] as readonly number[],
  /** Each finding and the retake reason are kept short. */
  findingsMax: 8,
  /** Extra words for the grader (Settings → Grading). */
  instructionsMax: 1000,
} as const;

/** One problem the model found, pointing at a photo the parent can open. */
export interface GradeFinding {
  /** The photo it is on, when the model named one. */
  photoId: string | null;
  /** "Sheet photo 1" / "Solution photo 3" — as the pages number them. */
  photoLabel: string | null;
  /** The question as printed ("3b"), when there is one. */
  question: string | null;
  problem: string;
  /** What right looks like (for the parent). */
  fix: string | null;
}

/** A grade as the parent sees it (item page). */
export interface HomeworkGrade {
  id: string;
  itemId: string;
  /** The Submit this grade is for. */
  submittedAt: string;
  status: GradeStatus;
  /** 0–100, only when graded. */
  score: number | null;
  summary: string | null;
  findings: GradeFinding[];
  /** Her note or blank pages say she couldn't do part of it. */
  stuck: boolean;
  /**
   * Photos she should take again — written for the child, about the photos only.
   * Can come with a score (some parts couldn't be read) or alone (`retake`).
   */
  retakeReason: string | null;
  retakePhotoIds: string[];
  /** The assignment title printed on the sheet, if the model could read one. */
  sheetTitle: string | null;
  model: string | null;
  createdAt: string;
  /** Set when an alert email went out for it. */
  alertedAt: string | null;
  /** Below the alert score: the parent is needed (and was emailed). */
  needsParent: boolean;
  /** Graded below the alert score. */
  lowScore: boolean;
  error: string | null;
}

/** On a list row (parent): enough for a chip. `pending` = waiting to be graded. */
export interface HomeworkGradeBrief {
  status: GradeStatus | "pending";
  score: number | null;
  needsParent: boolean;
  /** Graded below the alert score. */
  lowScore: boolean;
  /** She was asked to retake some photos. */
  retake: boolean;
}

/** The only grading the child sees (ADR 0014): a retake request, or "checking". */
export interface ChildPhotoCheck {
  retake: { reason: string; photoIds: string[] } | null;
  /** Her latest Submit has not been checked yet. */
  checking: boolean;
}

/** GET /api/homework-items/:id/grades — newest first. */
export interface HomeworkGradeList {
  grades: HomeworkGrade[];
  /** The latest Submit has no grade yet (or a Grade again is waiting). */
  pending: boolean;
  enabled: boolean;
}

// --- Settings (settings KV, Settings → Grading) -------------------------------

export const GRADING_SETTING_KEYS = {
  enabled: "grading.enabled",
  enabledAt: "grading.enabledAt",
  model: "grading.model",
  fallbackModel: "grading.fallbackModel",
  alertBelow: "grading.alertBelow",
  instructions: "grading.instructions",
  matchModel: "grading.matchModel",
} as const;

export const GRADING_DEFAULTS = {
  model: "claude-sonnet-5-5",
  fallbackModel: "gpt-6-luna",
  alertBelow: 80,
  matchModel: "claude-haiku-5-5",
} as const;

export const gradingSettingsSchema = z.object({
  enabled: z.boolean(),
  model: z.string().trim().min(1).max(200),
  /** "" = no fallback. */
  fallbackModel: z.string().trim().max(200),
  alertBelow: z.number().int().min(0).max(100),
  instructions: z.string().max(GRADING_LIMITS.instructionsMax),
  matchModel: z.string().trim().min(1).max(200),
});
export type GradingSettingsInput = z.infer<typeof gradingSettingsSchema>;

export interface GradingSettings extends GradingSettingsInput {
  /** When grading was last turned on; older submissions are not graded by the sweep. */
  enabledAt: string | null;
}

/** A model llmgw lists that reads images (GET /api/grading/models). */
export interface GradingModel {
  id: string;
  ownedBy: string;
  readsImages: boolean;
}

export interface GradingModelList {
  models: GradingModel[];
  /** llmgw could not be reached: the page keeps the saved values and says so. */
  unavailable: boolean;
}

// --- Rules ---------------------------------------------------------------------

/**
 * The parent is needed — and emailed at once: a score below the alert score.
 * A retake request alone is not (founder, 2026-11-11): the child sees it in the
 * app and the parent in the daily digest.
 */
export function gradeNeedsParent(
  grade: { status: GradeStatus; score: number | null },
  alertBelow: number,
): boolean {
  return grade.status === "graded" && grade.score !== null && grade.score < alertBelow;
}

/**
 * When a submission whose tries so far all failed may be tried again: never after
 * `maxAttempts`, else `retryAfterMs[failed - 1]` after the last failure.
 */
export function nextGradeAttemptAt(failedAttempts: number, lastFailureAt: Date): Date | null {
  if (failedAttempts <= 0) return lastFailureAt;
  if (failedAttempts >= GRADING_LIMITS.maxAttempts) return null;
  const wait = GRADING_LIMITS.retryAfterMs[failedAttempts - 1] ?? 0;
  return new Date(lastFailureAt.getTime() + wait);
}

/** "Sheet photo 2" / "Solution photo 1". */
export function gradePhotoLabel(kind: "sheet" | "solution", index: number): string {
  return `${kind === "sheet" ? "Sheet" : "Solution"} photo ${index + 1}`;
}
