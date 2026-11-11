// Homework grading (ADR 0014, 0017): every Submit of a child-entered item is
// graded by a vision model through llmgw. The parent sees the grade (and is
// emailed for a low score); the child sees hints per question and a retake
// request — never the score or the answers. Shapes and rules shared by API and web.

import { z } from "zod";

/** What a grade row says about one submission. */
export const gradeStatusSchema = z.enum(["graded", "retake", "not_gradable", "failed"]);
export type GradeStatus = z.infer<typeof gradeStatusSchema>;

/** Grades made with this prompt version or later carry Markdown + $LaTeX$ (ADR 0016). */
export const GRADING_RICH_TEXT_FROM = 3;

/** From this prompt version a grade has hints for the child, results and a note (ADR 0017). */
export const GRADING_HINTS_FROM = 4;

export const GRADING_LIMITS = {
  /** A submission is graded once it has been left alone this long (she may re-Submit). */
  settleMs: 60_000,
  /** Tries per submission; the fallback model runs inside each try. */
  maxAttempts: 3,
  /** Wait after the 1st and 2nd failed try before the next one. */
  retryAfterMs: [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000] as readonly number[],
  /** Each finding and the retake reason are kept short. */
  findingsMax: 12,
  /** Extra words for the grader (Settings → Grading). */
  instructionsMax: 1000,
} as const;

/** How one question went (prompt v4+): only questions with something to say are listed. */
export const findingResultSchema = z.enum(["wrong", "partly", "blank", "unreadable"]);
export type FindingResult = z.infer<typeof findingResultSchema>;

export const FINDING_RESULT_LABELS: Record<FindingResult, string> = {
  wrong: "Wrong",
  partly: "Partly right",
  blank: "Left blank",
  unreadable: "Can't read",
};

/** One question the model has something to say about, pointing at a photo. */
export interface GradeFinding {
  /** The photo it is on, when the model named one. */
  photoId: string | null;
  /** "Sheet photo 1" / "Solution photo 3" — as the pages number them. */
  photoLabel: string | null;
  /** The question as printed ("3b"), when there is one. */
  question: string | null;
  /** How it went (prompt v4+; null on older grades). */
  result: FindingResult | null;
  /** What is wrong — for the parent. */
  problem: string;
  /** What right looks like, with the answer — for the parent only. */
  fix: string | null;
  /** A short nudge for the child — never the answer (prompt v4+, ADR 0017). */
  hint: string | null;
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
  /** Questions with something to say, in the order they appear on the work. */
  findings: GradeFinding[];
  /** Questions that are right (labels), for the parent's "Correct:" line (prompt v4+). */
  correctQuestions: string[];
  /** One short, encouraging line for the child — no score (prompt v4+, ADR 0017). */
  childNote: string | null;
  /** The child's note or blank pages show they couldn't do part of it. */
  stuck: boolean;
  /**
   * Photos to take again — written for the child, about the photos only.
   * Can come with a score (some parts couldn't be read) or alone (`retake`).
   */
  retakeReason: string | null;
  retakePhotoIds: string[];
  /** The assignment title printed on the sheet, if the model could read one. */
  sheetTitle: string | null;
  model: string | null;
  /**
   * The grading prompt it was made with. From 3 on, summary / problem / fix are
   * Markdown with $LaTeX$ math (ADR 0016); before that, plain text.
   */
  promptVersion: number;
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
  /** The child was asked to retake some photos. */
  retake: boolean;
}

/** One row of the child's feedback: a question and a nudge, never the answer. */
export interface ChildFeedbackItem {
  question: string | null;
  photoId: string | null;
  /** "solution photo 2" / "homework photo 1", as the child's page numbers them. */
  photoLabel: string | null;
  hint: string;
}

/**
 * Everything the child sees of a grade (ADR 0014, 0017): an encouraging line,
 * a hint per question, a retake request, or "checking" — never the score, the
 * parent's summary, the problems or the fixes. The parent's item page shows the
 * same thing as "What <child> sees", built by the same function.
 */
export interface ChildFeedback {
  /** The latest Submit has not been checked yet. */
  checking: boolean;
  note: string | null;
  items: ChildFeedbackItem[];
  retake: { reason: string; photoIds: string[] } | null;
  /** Hints are Markdown + $LaTeX$ (prompt v3+). */
  rich: boolean;
}

/** "solution photo 2" for the child (their page calls sheet photos "homework photos"). */
export function childPhotoLabel(parentLabel: string | null): string | null {
  if (!parentLabel) return null;
  return parentLabel
    .replace(/^Sheet photo/i, "homework photo")
    .replace(/^Solution photo/i, "solution photo");
}

/**
 * What the child sees of one grade. `retakeOpen`: the retake request still
 * matters (the item isn't past due).
 */
export function childFeedbackFromGrade(
  grade: Pick<
    HomeworkGrade,
    "childNote" | "findings" | "retakeReason" | "retakePhotoIds" | "promptVersion"
  >,
  retakeOpen: boolean,
): Omit<ChildFeedback, "checking"> {
  return {
    note: grade.childNote,
    items: grade.findings
      .filter((f) => f.hint !== null && f.hint.trim() !== "")
      .map((f) => ({
        question: f.question,
        photoId: f.photoId,
        photoLabel: childPhotoLabel(f.photoLabel),
        hint: f.hint as string,
      })),
    retake:
      grade.retakeReason && retakeOpen
        ? { reason: grade.retakeReason, photoIds: grade.retakePhotoIds }
        : null,
    rich: grade.promptVersion >= GRADING_RICH_TEXT_FROM,
  };
}

/** GET /api/homework-items/:id/grades — newest first. */
export interface HomeworkGradeList {
  grades: HomeworkGrade[];
  /** The latest Submit has no grade yet (or a Grade again is waiting). */
  pending: boolean;
  enabled: boolean;
  /** The child's name, for "What <name> sees". */
  childName: string;
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

/** "Q3", "Q2b" for a printed number; a longer description as it is. */
export function gradeQuestionLabel(question: string): string {
  const q = question.trim();
  return /^[\w.()]{1,6}$/.test(q) ? `Q${q.replace(/^Q/i, "")}` : q;
}

/** "Sheet photo 2" / "Solution photo 1". */
export function gradePhotoLabel(kind: "sheet" | "solution", index: number): string {
  return `${kind === "sheet" ? "Sheet" : "Solution"} photo ${index + 1}`;
}
