"use client";

// Per-question rows for grade feedback (ADR 0017): one row per question, the
// label on the left (Q1c, or "Other"), then the photo link, the result, and the
// text. The parent's "For you" rows carry the problem and the fix; the child's
// rows — on the child's own page and in the parent's "What <child> sees" — carry
// only the hint. Both child views render `ChildFeedbackRows`, so they can't drift.

import {
  type ChildFeedback,
  FINDING_RESULT_LABELS,
  type FindingResult,
  gradeQuestionLabel,
} from "@homework/shared";
import { Camera } from "lucide-react";
import type { ReactNode } from "react";
import { MathText } from "./math-text";
import { usePhotoViewer } from "./photo-viewer";

const RESULT_TONE: Record<FindingResult, string> = {
  wrong: "bg-red-500/15 text-red-800 dark:text-red-300",
  partly: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  blank: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  unreadable: "bg-muted text-muted-foreground",
};

/** A titled part of the grade card, set off from the next by a rule. */
export function PanelSection({
  title,
  children,
  hint,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2 border-t pt-3">
      <h4 className="flex flex-wrap items-baseline gap-x-2 text-[0.8125rem] font-semibold">
        {title}
        {hint ? (
          <span className="text-[0.75rem] font-normal text-muted-foreground">{hint}</span>
        ) : null}
      </h4>
      {children}
    </section>
  );
}

/** "Q1c" / "Q15" / the label as printed / "Other". */
export function questionTag(question: string | null): string {
  return question ? gradeQuestionLabel(question) : "Other";
}

/** One question: label on the left, the rest on the right. */
export function QuestionRow({
  label,
  rich,
  meta,
  children,
}: {
  label: string;
  rich: boolean;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 border-t border-border/60 py-2 first:border-t-0 first:pt-0">
      <span className="pt-px text-[0.8125rem] font-semibold [overflow-wrap:anywhere]">
        <MathText text={label} rich={rich} inline />
      </span>
      <div className="min-w-0 space-y-0.5 text-[0.8125rem] leading-relaxed [overflow-wrap:anywhere]">
        {meta ? <div className="flex flex-wrap items-center gap-x-2 gap-y-1">{meta}</div> : null}
        {children}
      </div>
    </li>
  );
}

export function ResultBadge({ result }: { result: FindingResult }) {
  return (
    <span className={`rounded px-1.5 py-px text-[0.6875rem] font-medium ${RESULT_TONE[result]}`}>
      {FINDING_RESULT_LABELS[result]}
    </span>
  );
}

/** A link that opens the photo in the viewer. */
export function PhotoLink({
  photoId,
  label,
  src,
}: {
  photoId: string | null;
  label: string | null;
  src: (photoId: string) => string;
}) {
  const viewer = usePhotoViewer();
  if (!label) return null;
  if (!photoId) return <span className="text-[0.75rem] text-muted-foreground">{label}</span>;
  return (
    <button
      type="button"
      className="text-[0.75rem] font-medium text-primary underline-offset-4 hover:underline"
      onClick={() => viewer.openOne({ key: photoId, src: src(photoId) }, label)}
    >
      {label}
    </button>
  );
}

/** "solution photos 2, 7" for the retake row. */
function retakePhotosLabel(ids: readonly string[], labelOf: (id: string) => string | null): string {
  const labels = ids.map(labelOf).filter((l): l is string => !!l);
  return labels.length > 0 ? labels.join(", ") : "";
}

/**
 * Exactly what the child sees of a grade: the note, a hint per question, and
 * the retake request — no score, no problems, no answers.
 */
export function ChildFeedbackRows({
  feedback,
  photoSrc,
  photoLabel,
}: {
  feedback: Omit<ChildFeedback, "checking">;
  photoSrc: (photoId: string) => string;
  /** The child's label for a photo id ("solution photo 2"), for the retake row. */
  photoLabel: (photoId: string) => string | null;
}) {
  const { note, items, retake, rich } = feedback;
  if (!note && items.length === 0 && !retake) {
    return <p className="text-[0.8125rem] text-muted-foreground">Nothing to show.</p>;
  }
  return (
    <div className="space-y-2">
      {note ? (
        <p className="text-[0.875rem] [overflow-wrap:anywhere]">
          <MathText text={note} rich={rich} inline />
        </p>
      ) : null}
      {items.length > 0 || retake ? (
        <ul className="space-y-0">
          {items.map((it, i) => (
            <QuestionRow
              // biome-ignore lint/suspicious/noArrayIndexKey: rows never reorder
              key={i}
              label={questionTag(it.question)}
              rich={false}
              meta={<PhotoLink photoId={it.photoId} label={it.photoLabel} src={photoSrc} />}
            >
              <MathText text={it.hint} rich={rich} inline />
            </QuestionRow>
          ))}
          {retake ? (
            <QuestionRow
              label="Retake"
              rich={false}
              meta={
                <span className="flex items-center gap-1 text-[0.75rem] text-amber-800 dark:text-amber-300">
                  <Camera className="h-3.5 w-3.5" />
                  {retakePhotosLabel(retake.photoIds, photoLabel) || "photos"}
                </span>
              }
            >
              {retake.reason}
            </QuestionRow>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
