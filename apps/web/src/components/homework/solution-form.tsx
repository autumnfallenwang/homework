"use client";

import { HOMEWORK_LIMITS, type HomeworkItem } from "@homework/shared";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getMyHomeworkItem, saveMyHomeworkSolution, submitMyHomework } from "@/lib/api";
import { FieldError, RequiredMark } from "./choice-chips";
import { describeHomeworkError } from "./homework-form";
import { PhotoPanel, usePhotoDraft } from "./photo-panel";

/**
 * The solution section under the homework (ADR 0008, 0011): photos of the
 * finished work and/or a note. Save solution keeps a draft; Submit — open once a
 * solution is saved with no unsaved changes — marks the item done (again later
 * is fine — each Submit is recorded).
 */
export function SolutionForm({
  item,
  onSaved,
}: {
  item: HomeworkItem;
  onSaved: (item: HomeworkItem) => void;
}) {
  const [note, setNote] = useState(item.solution.note ?? "");
  const [savedNote, setSavedNote] = useState(item.solution.note ?? "");
  const photos = usePhotoDraft(item.solution.photos, HOMEWORK_LIMITS.photosPerSection);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Shown once Save was tried with no note, and cleared as soon as one is typed.
  const [attempted, setAttempted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const noteChanged = note.trim() !== savedNote.trim();
  const dirty = noteChanged || photos.dirty;
  const noteMissing = attempted && !note.trim();

  /** Send the draft: the note if it changed, then the photo changes. */
  async function persist() {
    if (noteChanged) await saveMyHomeworkSolution(item.id, { note: note.trim() });
    await photos.commit(item.id, "solution");
  }

  function settle(fresh: HomeworkItem) {
    photos.reset(fresh.solution.photos);
    setNote(fresh.solution.note ?? "");
    setSavedNote(fresh.solution.note ?? "");
    onSaved(fresh);
  }

  async function save() {
    setError(null);
    setNotice(null);
    if (!note.trim()) {
      setAttempted(true);
      document.getElementById("hw-solution-note")?.focus();
      return;
    }
    if (!dirty) {
      setNotice("No changes to save.");
      return;
    }
    setSaving(true);
    try {
      await persist();
      settle(await getMyHomeworkItem(item.id));
      setNotice("Solution saved.");
    } catch (err) {
      setError(describeHomeworkError(err));
    } finally {
      setSaving(false);
    }
  }

  /** Submit what is saved (the button waits for a saved solution and no unsaved changes). */
  async function submit() {
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      settle(await submitMyHomework(item.id));
      setNotice("Submitted.");
    } catch (err) {
      setError(describeHomeworkError(err));
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || photos.preparing > 0;
  const canSubmit = item.solution.note !== null && !dirty && !busy;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      noValidate
      aria-label="Solution"
    >
      <div className="grid gap-7 md:grid-cols-[minmax(0,1fr)_18.75rem] md:items-start">
        <div className="space-y-2">
          <Label htmlFor="hw-solution-note" className="gap-0 text-[0.75rem] font-semibold">
            Note
            <RequiredMark />
          </Label>
          <textarea
            id="hw-solution-note"
            value={note}
            maxLength={HOMEWORK_LIMITS.solutionNoteMax}
            rows={5}
            placeholder="e.g. Read ch. 6, or Q7 was hard"
            onChange={(e) => setNote(e.target.value)}
            required
            aria-invalid={noteMissing ? true : undefined}
            aria-describedby={noteMissing ? "hw-solution-note-error" : undefined}
            className="w-full min-w-0 resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30"
          />
          <FieldError
            id="hw-solution-note-error"
            message={noteMissing ? "Write a note" : undefined}
          />
        </div>
        <PhotoPanel
          title="Photos of your work"
          section="solution"
          draft={photos}
          itemId={item.id}
          disabled={busy}
        />
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2 border-t pt-4">
        <Button type="submit" size="lg" disabled={busy}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save solution
        </Button>
        <Button
          type="button"
          size="lg"
          onClick={() => void submit()}
          disabled={!canSubmit}
          title={canSubmit ? undefined : "Save the solution first"}
        >
          Submit
        </Button>
        <span className="flex-1 text-[0.8125rem]" role="status">
          {error ? <span className="text-destructive">{error}</span> : null}
          {!error && noteMissing ? (
            <span className="text-destructive">Check the field marked in red.</span>
          ) : null}
          {!error && !noteMissing && dirty && !saving ? (
            <span className="text-amber-700 dark:text-amber-400">Unsaved changes</span>
          ) : null}
          {notice && !error && !dirty ? <span className="text-meeting">{notice}</span> : null}
        </span>
      </div>
    </form>
  );
}
