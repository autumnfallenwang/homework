"use client";

// What a child sees of a grade on their item page (ADR 0014, 0017): "Checking
// your photos…" right after a Submit, then a note, one hint per question and the
// retake request — the same rows the parent sees as "What <child> sees". Never
// the score or the answers.

import {
  type ChildFeedback,
  childPhotoLabel,
  gradePhotoLabel,
  type HomeworkItem,
} from "@homework/shared";
import { Loader2, MessageSquareText } from "lucide-react";
import { myHomeworkPhotoUrl } from "@/lib/api";
import { ChildFeedbackRows } from "./feedback-rows";

export function FeedbackCard({ item, feedback }: { item: HomeworkItem; feedback: ChildFeedback }) {
  if (feedback.checking) {
    return (
      <div
        role="status"
        className="mb-4 flex items-center gap-2 rounded-lg border bg-card px-4 py-2.5 text-[0.8125rem] text-muted-foreground"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking your photos…
      </div>
    );
  }
  const labels = new Map<string, string>();
  item.photos.forEach((p, i) => {
    labels.set(p.id, childPhotoLabel(gradePhotoLabel("sheet", i)) ?? "");
  });
  item.solution.photos.forEach((p, i) => {
    labels.set(p.id, childPhotoLabel(gradePhotoLabel("solution", i)) ?? "");
  });
  return (
    <section
      role="status"
      aria-label="Feedback on your work"
      className={`mb-4 space-y-2 rounded-lg border px-4 py-3 ${
        feedback.retake ? "border-amber-500/40 bg-amber-500/5" : "bg-card"
      }`}
    >
      <h3 className="flex items-center gap-2 text-[0.8125rem] font-semibold">
        <MessageSquareText className="h-4 w-4 text-primary" />
        Feedback on your work
      </h3>
      <ChildFeedbackRows
        feedback={feedback}
        photoSrc={(id) => myHomeworkPhotoUrl(item.id, id)}
        photoLabel={(id) => labels.get(id) ?? null}
      />
      {feedback.retake ? (
        <p className="text-[0.75rem] text-muted-foreground">
          Add the new photo, remove the old one, then Submit again.
        </p>
      ) : null}
    </section>
  );
}
