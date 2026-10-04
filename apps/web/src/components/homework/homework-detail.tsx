"use client";

import {
  HOMEWORK_KIND_LABELS,
  type HomeworkHistoryEntry,
  type HomeworkItem,
  type HomeworkKind,
  type HomeworkPhotoRef,
} from "@homework/shared";
import { CheckCircle2 } from "lucide-react";
import { homeworkPhotoUrl } from "@/lib/api";
import { formatAddedAt, formatShortDay } from "@/lib/homework-format";
import { EditedBadge } from "./homework-list";
import { KindBadge } from "./kind-badge";
import { PhotoGrid, type PhotoSection, PhotoViewerProvider, usePhotoViewer } from "./photo-viewer";

/**
 * One item of a child's list, as the parent sees it: read only (ADR 0006, 0008).
 * The homework, the child's solution, when it was added, and every change made
 * after its first day.
 */
export function HomeworkDetail({
  item,
  history,
}: {
  item: HomeworkItem;
  history: HomeworkHistoryEntry[];
}) {
  return (
    <PhotoViewerProvider>
      <div className="mx-auto w-full max-w-4xl px-4 py-5 md:px-6">
        <h2
          className="text-2xl font-medium [overflow-wrap:anywhere]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {item.title}
        </h2>
        <div className="mt-2 mb-6 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-muted-foreground">
          <span className="rounded-full bg-primary/10 px-2 py-px text-[11px] font-medium text-primary">
            {item.className}
          </span>
          <KindBadge kind={item.kind} />
          <span>Given {formatShortDay(item.assignedOn)}</span>
          <span aria-hidden="true">·</span>
          <span>
            {item.kind === "test" ? "Test day" : "Due"} {formatShortDay(item.dueOn)}
          </span>
          <span aria-hidden="true">·</span>
          {item.submittedAt ? (
            <span className="flex items-center gap-1 text-meeting">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Done · submitted {formatAddedAt(item.submittedAt)}
            </span>
          ) : (
            <span>Not submitted yet</span>
          )}
          {item.edited ? <EditedBadge /> : null}
        </div>

        <div className="grid gap-7 md:grid-cols-[minmax(0,1fr)_340px] md:items-start">
          <dl className="space-y-4 text-[14px]">
            <div className="space-y-1">
              <dt className="text-[12px] font-semibold">Details</dt>
              <dd
                className={`whitespace-pre-line [overflow-wrap:anywhere] ${item.details ? "" : "text-muted-foreground italic"}`}
              >
                {item.details ?? "None"}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-[12px] font-semibold">Added</dt>
              <dd>{formatAddedAt(item.createdAt)}</dd>
            </div>
          </dl>
          <Photos itemId={item.id} section="sheet" photos={item.photos} label="Photos" />
        </div>

        <section className="mt-10 space-y-3" aria-labelledby="detail-solution">
          <h3
            id="detail-solution"
            className="text-xl font-medium"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Solution
          </h3>
          {item.hasSolution ? (
            <div className="grid gap-7 md:grid-cols-[minmax(0,1fr)_340px] md:items-start">
              <p
                className={`text-[14px] whitespace-pre-line [overflow-wrap:anywhere] ${item.solution.note ? "" : "text-muted-foreground italic"}`}
              >
                {item.solution.note ?? "No note"}
              </p>
              <Photos
                itemId={item.id}
                section="solution"
                photos={item.solution.photos}
                label="Photos of the work"
              />
            </div>
          ) : (
            <p className="rounded-lg border border-dashed px-4 py-5 text-[13px] text-muted-foreground">
              No solution yet.
            </p>
          )}
        </section>

        <section className="mt-10 space-y-3" aria-labelledby="detail-history">
          <div>
            <h3
              id="detail-history"
              className="text-xl font-medium"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              History
            </h3>
            <p className="text-[12px] text-muted-foreground">
              Every submit, and changes made after the first day (
              {formatAddedAt(item.firstDayEndsAt)}).
            </p>
          </div>
          {history.length === 0 ? (
            <p className="text-[13px] text-muted-foreground italic">Nothing recorded yet.</p>
          ) : (
            <ol className="space-y-2">
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className="grid gap-x-4 gap-y-0.5 rounded-lg bg-card px-4 py-2.5 text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:grid-cols-[150px_minmax(0,1fr)]"
                >
                  <span className="text-muted-foreground tabular-nums">
                    {formatAddedAt(entry.at)}
                  </span>
                  <HistoryLine itemId={item.id} entry={entry} />
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </PhotoViewerProvider>
  );
}

/** A section's photos as tiles; a click opens the viewer (no ✕, no Add: view only). */
function Photos({
  itemId,
  section,
  photos,
  label,
}: {
  itemId: string;
  section: PhotoSection;
  photos: HomeworkPhotoRef[];
  label: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[12px] font-semibold">{label}</p>
      {photos.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-5 text-center text-[13px] text-muted-foreground">
          No photos
        </p>
      ) : (
        <PhotoGrid
          section={section}
          label={label}
          photos={photos.map((p) => ({ key: p.id, src: homeworkPhotoUrl(itemId, p.id) }))}
        />
      )}
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = {
  class: "Class",
  kind: "Type",
  title: "What to do",
  details: "Details",
  assignedOn: "Given on",
  dueOn: "Due",
  note: "Solution note",
};

function showValue(field: string, value: string | null): string {
  if (value === null || value === "") return "(empty)";
  if (field === "dueOn" || field === "assignedOn") return formatShortDay(value);
  if (field === "kind") return HOMEWORK_KIND_LABELS[value as HomeworkKind] ?? value;
  return `“${value}”`;
}

/** One record in words: "Submitted", "Due: Mon 10/5 → Tue 10/6", "Removed a solution photo". */
function HistoryLine({ itemId, entry }: { itemId: string; entry: HomeworkHistoryEntry }) {
  const viewer = usePhotoViewer();
  if (entry.action === "submitted") {
    return <span className="min-w-0 font-medium text-meeting">Submitted</span>;
  }
  if (entry.action === "edited") {
    return (
      <span className="min-w-0 space-y-0.5">
        {Object.entries(entry.changes).map(([field, [from, to]]) => (
          <span key={field} className="block [overflow-wrap:anywhere]">
            <span className="font-medium">{FIELD_LABELS[field] ?? field}</span>:{" "}
            {showValue(field, from)} → {showValue(field, to)}
          </span>
        ))}
      </span>
    );
  }
  const what = entry.section === "solution" ? "a solution photo" : "a photo of the homework";
  return (
    <span className="min-w-0">
      {entry.action === "photo_added" ? "Added" : "Removed"} {what}
      {entry.photo ? (
        <>
          {" · "}
          <button
            type="button"
            onClick={() => {
              const photo = entry.photo;
              if (!photo) return;
              viewer.openOne(
                { key: photo.id, src: homeworkPhotoUrl(itemId, photo.id) },
                `${entry.action === "photo_added" ? "Added" : "Removed"} ${what} · ${formatAddedAt(entry.at)}`,
              );
            }}
            className="text-primary underline-offset-4 hover:underline"
          >
            {entry.photo.removed ? "view removed photo" : "view"}
          </button>
        </>
      ) : null}
    </span>
  );
}
