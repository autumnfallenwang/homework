"use client";

// The model's grade on the parent's item page (ADR 0014): the score, what it
// found (each finding opens its photo), the retake request she sees, and Grade
// again. Older grades fold underneath. Polls while a grade is on its way.

import {
  GRADING_RICH_TEXT_FROM,
  gradeQuestionLabel,
  type HomeworkGrade,
  type HomeworkGradeList,
  type HomeworkItem,
} from "@homework/shared";
import { Loader2, RotateCw } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getHomeworkItemGrades, homeworkPhotoUrl, requestHomeworkGrade } from "@/lib/api";
import { formatAddedAt } from "@/lib/homework-format";
import { MathText } from "./math-text";
import { usePhotoViewer } from "./photo-viewer";

const POLL_MS = 5000;

function scoreTone(g: HomeworkGrade): string {
  if (g.status !== "graded") return "text-muted-foreground";
  return g.lowScore ? "text-red-700 dark:text-red-400" : "text-meeting";
}

/** Prompt v3 on: Markdown + $LaTeX$ (ADR 0016); older grades are plain text. */
function isRich(g: HomeworkGrade): boolean {
  return g.promptVersion >= GRADING_RICH_TEXT_FROM;
}

function headline(g: HomeworkGrade): string {
  if (g.status === "graded" && g.score !== null) return `${g.score}/100`;
  if (g.status === "retake") return "Photos too hard to read";
  if (g.status === "not_gradable") return "Nothing to check";
  return "Couldn't grade";
}

export function GradePanel({ item, extra }: { item: HomeworkItem; extra?: ReactNode }) {
  const viewer = usePhotoViewer();
  const [list, setList] = useState<HomeworkGradeList | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await getHomeworkItemGrades(item.id));
    } catch {
      setError("Could not load the grade.");
    }
  }, [item.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // While a grade is on its way, look again every few seconds.
  useEffect(() => {
    if (!list?.pending) return;
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [list?.pending, load]);

  async function gradeAgain() {
    setRequesting(true);
    setError(null);
    try {
      await requestHomeworkGrade(item.id);
      await load();
    } catch {
      setError("Could not ask for a new grade.");
    } finally {
      setRequesting(false);
    }
  }

  if (!list) {
    return error ? <p className="mb-8 text-[0.8125rem] text-destructive">{error}</p> : null;
  }

  const usable = list.grades.filter((g) => g.status !== "failed");
  const current = usable[0] ?? null;
  const lastFailed = list.grades[0]?.status === "failed" ? list.grades[0] : null;
  const older = current
    ? list.grades.filter((g) => g.id !== current.id && g.status !== "failed")
    : [];

  if (!current && !list.pending && !lastFailed && !list.enabled) {
    return (
      <p className="mb-8 rounded-lg border border-dashed px-4 py-3 text-[0.8125rem] text-muted-foreground">
        Grading is off — turn it on in{" "}
        <Link href="/settings/grading" className="text-primary underline-offset-4 hover:underline">
          Settings → Grading
        </Link>
        .
      </p>
    );
  }

  const openPhoto = (photoId: string, label: string) =>
    viewer.openOne({ key: photoId, src: homeworkPhotoUrl(item.id, photoId) }, label);

  return (
    <section
      aria-labelledby="detail-grade"
      className="mb-8 space-y-3 rounded-lg border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 id="detail-grade" className="text-[0.875rem] font-semibold">
          Grade
        </h3>
        {current ? (
          <span className={`text-xl font-semibold tabular-nums ${scoreTone(current)}`}>
            {headline(current)}
          </span>
        ) : null}
        {current?.needsParent ? (
          <span className="rounded px-1.5 py-px text-[0.6875rem] font-medium bg-red-500/15 text-red-800 dark:text-red-300">
            Needs you
          </span>
        ) : null}
        {current?.stuck ? (
          <span className="rounded px-1.5 py-px text-[0.6875rem] font-medium bg-amber-500/15 text-amber-800 dark:text-amber-300">
            Stuck
          </span>
        ) : null}
        <span className="flex-1" />
        {list.pending ? (
          <span className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Grading… (a minute or two)
          </span>
        ) : item.submittedAt ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void gradeAgain()}
            disabled={requesting}
          >
            <RotateCw className="h-3.5 w-3.5" />
            {current ? "Grade again" : "Grade now"}
          </Button>
        ) : null}
      </div>

      {!current && !list.pending ? (
        <p className="text-[0.8125rem] text-muted-foreground">
          {item.submittedAt ? "Not graded yet." : "Graded once she submits it."}
        </p>
      ) : null}

      {current?.summary ? (
        <div className="text-[0.875rem] [overflow-wrap:anywhere]">
          <MathText text={current.summary} rich={isRich(current)} />
        </div>
      ) : null}

      {current && current.findings.length > 0 ? (
        <ul className="space-y-1.5">
          {current.findings.map((f, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: findings have no id and never reorder
              key={i}
              className="text-[0.8125rem] leading-relaxed [overflow-wrap:anywhere]"
            >
              {f.photoLabel || f.question ? (
                <span className="font-medium">
                  {f.photoId && f.photoLabel ? (
                    <button
                      type="button"
                      className="text-primary underline-offset-4 hover:underline"
                      onClick={() => openPhoto(f.photoId as string, f.photoLabel as string)}
                    >
                      {f.photoLabel}
                    </button>
                  ) : (
                    f.photoLabel
                  )}
                  {f.photoLabel && f.question ? " · " : ""}
                  {f.question ? (
                    <MathText text={gradeQuestionLabel(f.question)} rich={isRich(current)} inline />
                  ) : null}
                  :{" "}
                </span>
              ) : null}
              <MathText text={f.problem} rich={isRich(current)} inline />
              {f.fix ? (
                <span className="block text-meeting">
                  → <MathText text={f.fix} rich={isRich(current)} inline />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {current?.retakeReason ? (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-[0.8125rem] [overflow-wrap:anywhere]">
          <span className="font-medium">Asked her to retake photos</span> (she sees this):{" "}
          {current.retakeReason}
        </p>
      ) : null}

      {extra}

      {current || lastFailed ? (
        <p className="text-[0.75rem] text-muted-foreground">
          {current ? (
            <>
              Graded by {current.model ?? "—"} · {formatAddedAt(current.createdAt)}
              {current.alertedAt ? " · alert emailed" : ""}. A model's grade — check before acting
              on it.
            </>
          ) : null}
          {lastFailed ? (
            <span className="block text-destructive">
              Last try failed {formatAddedAt(lastFailed.createdAt)}
              {lastFailed.error ? `: ${lastFailed.error}` : ""}
            </span>
          ) : null}
        </p>
      ) : null}

      {older.length > 0 ? (
        <details className="text-[0.8125rem]">
          <summary className="cursor-pointer text-muted-foreground">
            Earlier grades ({older.length})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {older.map((g) => (
              <li key={g.id} className="text-muted-foreground">
                <span className="font-medium text-foreground tabular-nums">{headline(g)}</span> ·{" "}
                {formatAddedAt(g.createdAt)} · {g.model ?? "—"}
                {g.summary ? (
                  <span className="block">
                    <MathText text={g.summary} rich={isRich(g)} inline />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {error ? <p className="text-[0.8125rem] text-destructive">{error}</p> : null}
    </section>
  );
}
