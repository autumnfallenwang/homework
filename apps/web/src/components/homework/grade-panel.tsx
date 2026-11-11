"use client";

// The model's grade on the parent's item page (ADR 0014, 0016, 0017), in parts
// set off from each other:
//   the score + Grade again, and the retake request (if any);
//   For you — the summary, then one row per question: photo, result, what is
//     wrong, the fix (with the answer); the correct questions in one line;
//   What <child> sees — exactly the child's feedback: a note and one hint per
//     question (never the answer), the retake request;
//   Links — the teacher's gradebook (M14), passed in as `links`;
//   Earlier grades.
// Polls while a grade is on its way.

import {
  childFeedbackFromGrade,
  childPhotoLabel,
  GRADING_HINTS_FROM,
  GRADING_RICH_TEXT_FROM,
  gradePhotoLabel,
  type HomeworkGrade,
  type HomeworkGradeList,
  type HomeworkItem,
} from "@homework/shared";
import { Loader2, RotateCw } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { getHomeworkItemGrades, homeworkPhotoUrl, requestHomeworkGrade } from "@/lib/api";
import { formatAddedAt } from "@/lib/homework-format";
import { toLocalIso } from "@/lib/local-date";
import {
  ChildFeedbackRows,
  PanelSection,
  PhotoLink,
  QuestionRow,
  questionTag,
  ResultBadge,
} from "./feedback-rows";
import { MathText } from "./math-text";

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

export function GradePanel({ item, links }: { item: HomeworkItem; links?: ReactNode }) {
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

  // The child's labels for the photos, by id ("solution photo 2").
  const childLabels = useMemo(() => {
    const m = new Map<string, string>();
    item.photos.forEach((p, i) => {
      m.set(p.id, childPhotoLabel(gradePhotoLabel("sheet", i)) ?? "");
    });
    item.solution.photos.forEach((p, i) => {
      m.set(p.id, childPhotoLabel(gradePhotoLabel("solution", i)) ?? "");
    });
    return m;
  }, [item]);

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
  const name = list.childName || "the child";

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

  const photoSrc = (id: string) => homeworkPhotoUrl(item.id, id);
  const childView = current
    ? childFeedbackFromGrade(current, item.dueOn >= toLocalIso(new Date()))
    : null;

  return (
    <section
      aria-labelledby="detail-grade"
      className="mb-8 space-y-3 rounded-lg border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
    >
      {/* The score and Grade again */}
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

      {current?.retakeReason ? (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-[0.8125rem] [overflow-wrap:anywhere]">
          <span className="font-medium">Asked {name} to retake photos:</span> {current.retakeReason}
        </p>
      ) : null}

      {!current && !list.pending ? (
        <p className="text-[0.8125rem] text-muted-foreground">
          {item.submittedAt ? "Not graded yet." : "Graded once it is submitted."}
        </p>
      ) : null}

      {/* For you */}
      {current ? (
        <PanelSection title="For you" hint="the full comments, with the answers">
          {current.summary ? (
            <div className="text-[0.875rem] [overflow-wrap:anywhere]">
              <MathText text={current.summary} rich={isRich(current)} />
            </div>
          ) : null}
          {current.findings.length > 0 ? (
            <ul>
              {current.findings.map((f, i) => (
                <QuestionRow
                  // biome-ignore lint/suspicious/noArrayIndexKey: findings never reorder
                  key={i}
                  label={questionTag(f.question)}
                  rich={isRich(current)}
                  meta={
                    <>
                      <PhotoLink photoId={f.photoId} label={f.photoLabel} src={photoSrc} />
                      {f.result ? <ResultBadge result={f.result} /> : null}
                    </>
                  }
                >
                  <div>
                    <MathText text={f.problem} rich={isRich(current)} inline />
                  </div>
                  {f.fix ? (
                    <div className="text-meeting">
                      → <MathText text={f.fix} rich={isRich(current)} inline />
                    </div>
                  ) : null}
                </QuestionRow>
              ))}
            </ul>
          ) : null}
          {current.correctQuestions.length > 0 ? (
            <p className="text-[0.8125rem] text-meeting">
              <span className="font-medium">Correct:</span>{" "}
              {current.correctQuestions.map(questionTag).join(", ")}
            </p>
          ) : null}
          <p className="text-[0.75rem] text-muted-foreground">
            Graded by {current.model ?? "—"} · {formatAddedAt(current.createdAt)}
            {current.alertedAt ? " · alert emailed" : ""}. A model's grade — check before acting on
            it.
          </p>
        </PanelSection>
      ) : null}

      {/* What the child sees */}
      {current && childView ? (
        <PanelSection title={`What ${name} sees`} hint="hints only — no score, no answers">
          {current.promptVersion >= GRADING_HINTS_FROM ? (
            <ChildFeedbackRows
              feedback={childView}
              photoSrc={photoSrc}
              photoLabel={(id) => childLabels.get(id) ?? null}
            />
          ) : (
            <p className="text-[0.8125rem] text-muted-foreground">
              {childView.retake
                ? `Only the retake request above. This grade was made before hints existed — Grade again to add them.`
                : "Nothing — this grade was made before hints existed. Grade again to add them."}
            </p>
          )}
        </PanelSection>
      ) : null}

      {/* Links to the teacher's gradebook (M14) */}
      {links}

      {lastFailed ? (
        <p className="text-[0.75rem] text-destructive">
          Last try failed {formatAddedAt(lastFailed.createdAt)}
          {lastFailed.error ? `: ${lastFailed.error}` : ""}
        </p>
      ) : null}

      {older.length > 0 ? (
        <PanelSection title={`Earlier grades (${older.length})`}>
          <ul className="space-y-1.5 text-[0.8125rem]">
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
        </PanelSection>
      ) : null}

      {error ? <p className="text-[0.8125rem] text-destructive">{error}</p> : null}
    </section>
  );
}
