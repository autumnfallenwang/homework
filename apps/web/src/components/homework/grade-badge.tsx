"use client";

// Grading chips on list rows (ADR 0014, 0017). The parent sees the latest
// Submit's grade; the child sees "Checking…", "Retake photo" or "2 hints" —
// never a score.

import {
  type ChildFeedback,
  type HomeworkGradeBrief,
  type TeacherGradeBrief,
  teacherShortLabel,
} from "@homework/shared";

const CHIP = "rounded px-1.5 py-px text-[0.6875rem] font-medium tabular-nums";
const RED = "bg-red-500/15 text-red-800 dark:text-red-300";
const AMBER = "bg-amber-500/15 text-amber-800 dark:text-amber-300";
const GREEN = "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
const GREY = "bg-muted text-muted-foreground";
const BLUE = "bg-sky-500/15 text-sky-800 dark:text-sky-300";

export function GradeChip({ grade }: { grade: HomeworkGradeBrief }) {
  if (grade.status === "graded" && grade.score !== null) {
    const tone = grade.lowScore ? RED : grade.retake ? AMBER : GREEN;
    return (
      <span
        className={`${CHIP} ${tone}`}
        title={`Graded ${grade.score}/100${grade.retake ? " · photos to retake" : ""}`}
      >
        {grade.score}
        {grade.retake ? " · Retake" : ""}
      </span>
    );
  }
  if (grade.status === "retake") {
    return (
      <span className={`${CHIP} ${AMBER}`} title="Photos too hard to read — a retake was asked for">
        Retake
      </span>
    );
  }
  if (grade.status === "pending") {
    return (
      <span className={`${CHIP} ${GREY}`} title="Waiting to be graded">
        Grading…
      </span>
    );
  }
  if (grade.status === "not_gradable") {
    return (
      <span className={`${CHIP} ${GREY}`} title="No photos of the work to check">
        Not checked
      </span>
    );
  }
  return (
    <span className={`${CHIP} ${GREY}`} title="The model could not grade it">
      Couldn't grade
    </span>
  );
}

/**
 * The child's list chip (ADR 0017): "Checking…", "Retake photo", or "2 hints"
 * while the item isn't past due — never a score.
 */
export function FeedbackChip({ feedback, open }: { feedback: ChildFeedback; open: boolean }) {
  if (feedback.checking) {
    return (
      <span className={`${CHIP} ${GREY}`} title="Your photos are being checked">
        Checking…
      </span>
    );
  }
  const n = open ? feedback.items.length : 0;
  return (
    <>
      {feedback.retake ? (
        <span className={`${CHIP} ${AMBER}`} title={feedback.retake.reason}>
          Retake photo
        </span>
      ) : null}
      {n > 0 ? (
        <span className={`${CHIP} ${BLUE}`} title="Open it to see the hints">
          {n} {n === 1 ? "hint" : "hints"}
        </span>
      ) : null}
    </>
  );
}

/** A submitted item the child should still open: checking, a retake request, or hints before the due day. */
export function hasOpenFeedback(
  feedback: ChildFeedback | null | undefined,
  dueOn: string,
  today: string,
): boolean {
  if (!feedback) return false;
  return (
    feedback.checking || feedback.retake !== null || (feedback.items.length > 0 && dueOn >= today)
  );
}

/** The teacher's score for a linked item (M14), "T: M". */
export function TeacherChip({ grade }: { grade: TeacherGradeBrief }) {
  const tone =
    grade.band === "meets"
      ? GREEN
      : grade.band === "progressing" || grade.band === "beginning" || grade.band === "missing"
        ? RED
        : GREY;
  return (
    <span
      className={`${CHIP} ${tone}`}
      title={`Teacher's grade in TeacherEase: ${grade.score}${grade.probable ? " (probable match)" : ""}`}
    >
      T: {teacherShortLabel(grade.band, grade.score)}
      {grade.probable ? "?" : ""}
    </span>
  );
}
