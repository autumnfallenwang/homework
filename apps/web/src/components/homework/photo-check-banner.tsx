"use client";

// What the child sees of grading (ADR 0014): a retake request — which photos
// and why — or "Checking your photos…" right after a Submit. Never a score.

import type { ChildPhotoCheck, HomeworkItem } from "@homework/shared";
import { Camera, Loader2 } from "lucide-react";

/** "Solution photo 2", by the photo's place on her page. */
function photoLabels(item: HomeworkItem, ids: readonly string[]): string[] {
  const labels: string[] = [];
  item.photos.forEach((p, i) => {
    if (ids.includes(p.id)) labels.push(`homework photo ${i + 1}`);
  });
  item.solution.photos.forEach((p, i) => {
    if (ids.includes(p.id)) labels.push(`solution photo ${i + 1}`);
  });
  return labels;
}

export function PhotoCheckBanner({ item, check }: { item: HomeworkItem; check: ChildPhotoCheck }) {
  if (check.retake) {
    const labels = photoLabels(item, check.retake.photoIds);
    return (
      <div
        role="status"
        className="mb-4 flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3"
      >
        <Camera className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
        <div className="min-w-0 space-y-1 text-[0.8125rem]">
          <p className="font-semibold">Retake photo</p>
          <p className="[overflow-wrap:anywhere]">{check.retake.reason}</p>
          {labels.length > 0 ? (
            <p className="text-muted-foreground">Marked below: {labels.join(", ")}.</p>
          ) : null}
          <p className="text-muted-foreground">
            Add the new photo, remove the old one, then Submit again.
          </p>
        </div>
      </div>
    );
  }
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
