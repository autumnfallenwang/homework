"use client";

import { HOMEWORK_LIMITS, type HomeworkItem } from "@homework/shared";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getMyHomeworkItem, saveMyHomeworkSolution } from "@/lib/api";
import { describeHomeworkError } from "./homework-form";
import { PhotoPanel, usePhotoDraft } from "./photo-panel";

/**
 * The solution section under the homework (ADR 0008): photos of the finished work
 * and/or a note, with its own Save. Any note or photo makes the item done.
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
  const photos = usePhotoDraft(item.solution.photos, HOMEWORK_LIMITS.solutionPhotosPerItem);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const noteChanged = note.trim() !== savedNote.trim();
  const dirty = noteChanged || photos.dirty;
  const empty = !note.trim() && photos.kept.length + photos.pending.length === 0;

  async function save() {
    setError(null);
    setNotice(null);
    if (!dirty) {
      if (empty) setError("Add a photo or a note first.");
      else setNotice("No changes to save.");
      return;
    }
    setSaving(true);
    try {
      if (noteChanged) await saveMyHomeworkSolution(item.id, { note: note.trim() || null });
      await photos.commit(item.id, "solution");
      const fresh = await getMyHomeworkItem(item.id);
      photos.reset(fresh.solution.photos);
      setNote(fresh.solution.note ?? "");
      setSavedNote(fresh.solution.note ?? "");
      setNotice(fresh.hasSolution ? "Solution saved." : "Solution cleared.");
      onSaved(fresh);
    } catch (err) {
      setError(describeHomeworkError(err));
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || photos.preparing > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      noValidate
      aria-label="Solution"
    >
      <div className="grid gap-7 md:grid-cols-[minmax(0,1fr)_300px] md:items-start">
        <div className="space-y-2">
          <Label htmlFor="hw-solution-note" className="text-[12px] font-semibold">
            Note <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <textarea
            id="hw-solution-note"
            value={note}
            maxLength={HOMEWORK_LIMITS.solutionNoteMax}
            rows={5}
            placeholder="e.g. Read ch. 6, or Q7 was hard"
            onChange={(e) => setNote(e.target.value)}
            className="w-full min-w-0 resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
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
        <span className="flex-1 text-[13px]" role="status">
          {error ? <span className="text-destructive">{error}</span> : null}
          {!error && dirty && !saving ? (
            <span className="text-amber-700 dark:text-amber-400">Unsaved changes</span>
          ) : null}
          {notice && !error && !dirty ? <span className="text-meeting">{notice}</span> : null}
        </span>
      </div>
    </form>
  );
}
