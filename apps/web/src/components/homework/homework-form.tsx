"use client";

import {
  HOMEWORK_KIND_LABELS,
  HOMEWORK_LIMITS,
  type HomeworkClass,
  type HomeworkDateProblem,
  type HomeworkItem,
  type HomeworkKind,
  homeworkDateProblem,
  nextSchoolDay,
  OTHER_CLASS_LABEL,
} from "@homework/shared";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApiClientError,
  createMyHomework,
  deleteMyHomework,
  getMyHomeworkItem,
  updateMyHomework,
} from "@/lib/api";
import { type ChipOption, ChoiceChips, FieldError, RequiredMark } from "./choice-chips";
import { PhotoPanel, usePhotoDraft } from "./photo-panel";

const OTHER = "__other";

/** The fields Save can stop on, in page order (Save jumps to the first one). */
type Field = "class" | "title" | "assignedOn" | "dueOn";
const FIELD_ORDER: Field[] = ["class", "title", "assignedOn", "dueOn"];
const FIELD_IDS: Record<Field, string> = {
  class: "hw-class",
  title: "hw-title",
  assignedOn: "hw-given",
  dueOn: "hw-due",
};

/** Where a broken date rule shows, and what it says under that field. */
const DATE_RULES: Record<HomeworkDateProblem, { field: Field; message: string }> = {
  given_after_today: { field: "assignedOn", message: "Can't be after today" },
  due_before_given: { field: "dueOn", message: "Can't be before the day it was given" },
};

function isDateProblem(code: unknown): code is HomeworkDateProblem {
  return code === "given_after_today" || code === "due_before_given";
}

const KIND_OPTIONS: ChipOption<HomeworkKind>[] = (
  Object.keys(HOMEWORK_KIND_LABELS) as HomeworkKind[]
).map((k) => ({ value: k, label: HOMEWORK_KIND_LABELS[k] }));

export function describeHomeworkError(err: unknown): string {
  if (err instanceof ApiClientError) {
    const code = (err.body as { code?: string }).code;
    if (code === "entry_off") return "Homework entry is off. Ask a parent to turn it on.";
    if (err.status === 400 && err.body.error === "Validation failed") {
      return "Check the class, what to do and the dates.";
    }
    return err.body.error;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

/** Has the item's first day (until the next 7 AM after it was added) ended? ADR 0008. */
export function firstDayOver(item: HomeworkItem | null): boolean {
  return item !== null && Date.now() >= Date.parse(item.firstDayEndsAt);
}

/**
 * The homework section of the child's item page — the whole Add page for a new
 * item (ADR 0006, 0007, 0008). Class and type are single-choice chips; "Given on"
 * starts at today and the due date at the next school day; photos of the sheet
 * are shrunk in the browser and uploaded after the item is saved. Save is never
 * greyed out: it marks every missing field and broken date rule in red and jumps
 * to the first. After the first day Given on is locked and Delete is gone.
 */
export function HomeworkForm({
  item,
  classes,
  today,
  onSaved,
}: {
  item: HomeworkItem | null;
  classes: HomeworkClass[];
  today: string;
  /** After a save; `created` when it was a new item (Save, not Save and add another). */
  onSaved: (item: HomeworkItem, created: boolean) => void;
}) {
  const router = useRouter();
  const firstChoice = classes.length === 0 ? OTHER : null;

  const [itemId, setItemId] = useState<string | null>(item?.id ?? null);
  const [classChoice, setClassChoice] = useState<string | null>(
    item ? (item.classId ?? OTHER) : firstChoice,
  );
  const [kind, setKind] = useState<HomeworkKind>(item?.kind ?? "homework");
  const [title, setTitle] = useState(item?.title ?? "");
  const [details, setDetails] = useState(item?.details ?? "");
  const [assignedOn, setAssignedOn] = useState(item?.assignedOn ?? today);
  const [dueOn, setDueOn] = useState(item?.dueOn ?? nextSchoolDay(today));
  const photos = usePhotoDraft(item?.photos ?? [], HOMEWORK_LIMITS.photosPerSection);
  const [attempted, setAttempted] = useState(false);
  const [serverDateProblem, setServerDateProblem] = useState<HomeworkDateProblem | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // What was last saved, to tell the child about unsaved changes.
  const fieldsNow = {
    classChoice,
    kind,
    title: title.trim(),
    details: details.trim(),
    assignedOn,
    dueOn,
  };
  const [baseline, setBaseline] = useState(item ? fieldsNow : null);
  const dirty =
    baseline !== null &&
    (photos.dirty ||
      (Object.keys(fieldsNow) as (keyof typeof fieldsNow)[]).some(
        (k) => fieldsNow[k] !== baseline[k],
      ));

  const locked = firstDayOver(item);

  const classOptions: ChipOption<string>[] = classes.map((c) => ({ value: c.id, label: c.name }));
  // An item may still sit in a class the parent has since removed.
  if (item?.classId && !classes.some((c) => c.id === item.classId)) {
    classOptions.push({ value: item.classId, label: item.className });
  }
  classOptions.push({ value: OTHER, label: OTHER_CLASS_LABEL, fixed: true });

  /** What stops Save right now: missing fields first, then the date rules. */
  function findProblems(): Partial<Record<Field, string>> {
    const found: Partial<Record<Field, string>> = {};
    if (!classChoice) found.class = "Pick a class";
    if (!title.trim()) found.title = "Write what to do";
    if (!assignedOn) found.assignedOn = "Pick the day it was given";
    if (!dueOn) found.dueOn = kind === "test" ? "Pick the test day" : "Pick the due date";
    const rule = assignedOn && dueOn ? homeworkDateProblem({ assignedOn, dueOn }, today) : null;
    // A locked Given on is the saved one; only the due date can break the rule.
    const broken = locked && rule === "given_after_today" ? null : (rule ?? serverDateProblem);
    if (broken) found[DATE_RULES[broken].field] ??= DATE_RULES[broken].message;
    return found;
  }

  // Shown once Save was tried, and kept live so each one clears as it is fixed.
  const problems = attempted ? findProblems() : {};
  const problemCount = Object.keys(problems).length;

  function jumpTo(field: Field) {
    const el = document.getElementById(FIELD_IDS[field]);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const target = el instanceof HTMLInputElement ? el : el.querySelector("input");
    target?.focus({ preventScroll: true });
  }

  /** Ready for the next item; the dates stay (often several from the same day). */
  function resetForNext() {
    setAttempted(false);
    setItemId(null);
    setClassChoice(firstChoice);
    setKind("homework");
    setTitle("");
    setDetails("");
    photos.reset([]);
  }

  async function save(another: boolean) {
    setError(null);
    setNotice(null);
    setAttempted(true);
    const found = findProblems();
    const first = FIELD_ORDER.find((f) => found[f]);
    if (first) return jumpTo(first);
    setSaving(true);
    try {
      const input = {
        classId: classChoice === OTHER ? null : classChoice,
        kind,
        title: title.trim(),
        details: details.trim() || null,
        assignedOn,
        dueOn,
      };
      const created = itemId === null;
      const current = itemId
        ? await updateMyHomework(itemId, input)
        : await createMyHomework(input);
      setItemId(current.id);
      await photos.commit(current.id, "sheet");
      if (another) {
        resetForNext();
        setNotice(`Added “${input.title}”. Next one?`);
        return;
      }
      const fresh = await getMyHomeworkItem(current.id);
      photos.reset(fresh.photos);
      setBaseline({ ...fieldsNow });
      setAttempted(false);
      setNotice("Saved.");
      onSaved(fresh, created);
    } catch (err) {
      const code = err instanceof ApiClientError ? (err.body as { code?: string }).code : null;
      if (isDateProblem(code)) {
        // The server's today ran ahead of or behind this browser's.
        setServerDateProblem(code);
        jumpTo(DATE_RULES[code].field);
      } else {
        setError(describeHomeworkError(err));
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!itemId) return;
    setSaving(true);
    setError(null);
    try {
      await deleteMyHomework(itemId);
      router.push("/child");
    } catch (err) {
      setError(describeHomeworkError(err));
      setConfirmingDelete(false);
      setSaving(false);
    }
  }

  const busy = saving || photos.preparing > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
      noValidate
      aria-label="Homework"
    >
      <div className="grid gap-7 md:grid-cols-[minmax(0,1fr)_300px] md:items-start">
        <div className="space-y-5">
          <ChoiceChips
            id={FIELD_IDS.class}
            legend="Class"
            options={classOptions}
            value={classChoice}
            onChange={setClassChoice}
            required
            error={problems.class}
          />
          <ChoiceChips
            legend="Type"
            options={KIND_OPTIONS}
            value={kind}
            onChange={setKind}
            required
          />
          <div className="space-y-2">
            <Label htmlFor={FIELD_IDS.title} className="gap-0 text-[12px] font-semibold">
              What to do
              <RequiredMark />
            </Label>
            <Input
              id={FIELD_IDS.title}
              value={title}
              maxLength={HOMEWORK_LIMITS.titleMax}
              placeholder="e.g. Homework #6, or read ch. 6 + worksheet"
              onChange={(e) => setTitle(e.target.value)}
              required
              aria-invalid={problems.title ? true : undefined}
              aria-describedby={problems.title ? "hw-title-error" : undefined}
            />
            <FieldError id="hw-title-error" message={problems.title} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hw-details" className="text-[12px] font-semibold">
              Details <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <textarea
              id="hw-details"
              value={details}
              maxLength={HOMEWORK_LIMITS.detailsMax}
              rows={4}
              placeholder="Page numbers, questions, what to bring"
              onChange={(e) => setDetails(e.target.value)}
              className="w-full min-w-0 resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
            />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-5">
            <div className="w-[200px] space-y-2">
              <Label htmlFor={FIELD_IDS.assignedOn} className="gap-0 text-[12px] font-semibold">
                Given on
                <RequiredMark />
              </Label>
              <Input
                id={FIELD_IDS.assignedOn}
                type="date"
                value={assignedOn}
                max={today}
                disabled={locked}
                onChange={(e) => {
                  setAssignedOn(e.target.value);
                  setServerDateProblem(null);
                }}
                required
                aria-invalid={problems.assignedOn ? true : undefined}
                aria-describedby={problems.assignedOn ? "hw-given-error" : undefined}
              />
              <FieldError id="hw-given-error" message={problems.assignedOn} />
            </div>
            <div className="w-[200px] space-y-2">
              <Label htmlFor={FIELD_IDS.dueOn} className="gap-0 text-[12px] font-semibold">
                {kind === "test" ? "Test day" : "Due"}
                <RequiredMark />
              </Label>
              <Input
                id={FIELD_IDS.dueOn}
                type="date"
                value={dueOn}
                min={assignedOn || undefined}
                onChange={(e) => {
                  setDueOn(e.target.value);
                  setServerDateProblem(null);
                }}
                required
                aria-invalid={problems.dueOn ? true : undefined}
                aria-describedby={problems.dueOn ? "hw-due-error" : undefined}
              />
              <FieldError id="hw-due-error" message={problems.dueOn} />
            </div>
          </div>
        </div>

        <PhotoPanel title="Photos" section="sheet" draft={photos} itemId={itemId} disabled={busy} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t pt-4">
        {confirmingDelete ? (
          <>
            <span className="text-[13px]">Delete this homework?</span>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void remove()}
              disabled={busy}
            >
              Delete
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirmingDelete(false)}>
              Keep
            </Button>
          </>
        ) : (
          <>
            <Button type="submit" size="lg" disabled={busy}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save homework
            </Button>
            {itemId ? null : (
              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={() => void save(true)}
                disabled={busy}
              >
                Save and add another
              </Button>
            )}
            {itemId && !locked ? (
              <Button
                type="button"
                size="lg"
                variant="destructive"
                onClick={() => setConfirmingDelete(true)}
                disabled={busy}
              >
                Delete
              </Button>
            ) : null}
          </>
        )}
        <span className="flex-1 text-[13px]" role="status">
          {error ? <span className="text-destructive">{error}</span> : null}
          {problemCount > 0 && !error ? (
            <span className="text-destructive">
              {problemCount === 1
                ? "Check the field marked in red."
                : `Check the ${problemCount} fields marked in red.`}
            </span>
          ) : null}
          {!error && problemCount === 0 && dirty && !saving ? (
            <span className="text-amber-700 dark:text-amber-400">Unsaved changes</span>
          ) : null}
          {notice && !error && problemCount === 0 && !dirty ? (
            <span className="text-meeting">{notice}</span>
          ) : null}
        </span>
      </div>
    </form>
  );
}
