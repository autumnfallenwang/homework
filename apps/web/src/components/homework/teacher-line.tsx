"use client";

// The teacher's grade for the item (M14), under the model's grade on the
// parent's item page. Links come from a small model after each TeacherEase
// fetch: confident ones show as "Teacher", unsure ones as "Probably" with
// Confirm / Not this; the parent can also pick another of the teacher's
// assignments due near hers.

import { type TeacherLink, type TeacherMatchView, teacherShortLabel } from "@homework/shared";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getHomeworkItemTeacher,
  pickHomeworkItemTeacher,
  setHomeworkItemTeacherState,
} from "@/lib/api";
import { PanelSection } from "./feedback-rows";

function scoreText(l: TeacherLink): string {
  if (!l.score || !l.band) return "not graded yet";
  const short = teacherShortLabel(l.band, l.score);
  return short === l.score ? l.score : `${l.score}`;
}

export function TeacherLine({ itemId }: { itemId: string }) {
  const [view, setView] = useState<TeacherMatchView | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getHomeworkItemTeacher(itemId)
      .then(setView)
      .catch(() => setView(null));
  }, [itemId]);

  if (!view || (view.links.length === 0 && view.candidates.length === 0)) return null;

  const act = async (fn: () => Promise<TeacherMatchView>) => {
    setBusy(true);
    setError(null);
    try {
      setView(await fn());
      setPicking(false);
    } catch {
      setError("Could not save that.");
    } finally {
      setBusy(false);
    }
  };

  const linkedIds = new Set(view.links.map((l) => l.teAssignmentId));
  const others = view.candidates.filter((c) => !linkedIds.has(c.teAssignmentId));

  return (
    <PanelSection title="Links" hint="the teacher's gradebook in TeacherEase">
      <div className="space-y-1.5 text-[0.8125rem]">
        {view.links.length === 0 ? (
          <p className="text-muted-foreground">
            Teacher: not linked to a TeacherEase assignment yet.
          </p>
        ) : (
          view.links.map((l) => (
            <div key={l.teAssignmentId} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium">
                {l.state === "confirmed" ? "Teacher" : "Probably"}:
              </span>
              <span className="[overflow-wrap:anywhere]">{l.assignmentName}</span>
              <span
                className={`rounded px-1.5 py-px text-[0.6875rem] font-semibold tabular-nums ${
                  l.band === "meets"
                    ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                    : l.band === "progressing" || l.band === "beginning" || l.band === "missing"
                      ? "bg-red-500/15 text-red-800 dark:text-red-300"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {scoreText(l)}
              </span>
              {l.state === "suggested" ? (
                <>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void act(() =>
                        setHomeworkItemTeacherState(itemId, l.teAssignmentId, "confirmed"),
                      )
                    }
                  >
                    Confirm
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void act(() =>
                        setHomeworkItemTeacherState(itemId, l.teAssignmentId, "rejected"),
                      )
                    }
                  >
                    Not this
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void act(() =>
                      setHomeworkItemTeacherState(itemId, l.teAssignmentId, "rejected"),
                    )
                  }
                >
                  Unlink
                </Button>
              )}
              {l.reason ? (
                <span className="basis-full text-[0.75rem] text-muted-foreground">{l.reason}</span>
              ) : null}
            </div>
          ))
        )}
        {others.length > 0 ? (
          picking ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Pick the teacher's assignment"
                defaultValue=""
                disabled={busy}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  if (id) void act(() => pickHomeworkItemTeacher(itemId, id));
                }}
                className="h-8 max-w-full rounded-md border border-input bg-card px-2 text-[0.8125rem]"
              >
                <option value="">Pick an assignment…</option>
                {others.map((c) => (
                  <option key={c.teAssignmentId} value={c.teAssignmentId}>
                    {c.assignmentName}
                    {c.dueDate ? ` (due ${c.dueDate})` : ""}
                  </option>
                ))}
              </select>
              <Button type="button" size="xs" variant="ghost" onClick={() => setPicking(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <button
              type="button"
              className="text-[0.75rem] text-primary underline-offset-4 hover:underline"
              onClick={() => setPicking(true)}
            >
              {view.links.length === 0 ? "Link it yourself" : "Pick another"}
            </button>
          )
        ) : null}
        {error ? <p className="text-destructive">{error}</p> : null}
      </div>
    </PanelSection>
  );
}
