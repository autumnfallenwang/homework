"use client";

import type { HomeworkPhotoKind, HomeworkPhotoRef } from "@homework/shared";
import { ImageIcon, Loader2, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { deleteMyHomeworkPhoto, myHomeworkPhotoUrl, uploadMyHomeworkPhoto } from "@/lib/api";
import { PhotoReadError, shrinkPhoto } from "@/lib/photo-shrink";
import { PhotoGrid, type PhotoSection, type ViewerPhoto } from "./photo-viewer";

interface PendingPhoto {
  key: string;
  blob: Blob;
  url: string;
}

/**
 * The photos of one section while the child edits it: what is saved, what she
 * took off, and new ones shrunk in the browser but not uploaded yet. `commit`
 * sends the changes once the section's Save is pressed.
 */
export function usePhotoDraft(initial: HomeworkPhotoRef[], limit: number) {
  const [saved, setSaved] = useState<HomeworkPhotoRef[]>(initial);
  const [removed, setRemoved] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [preparing, setPreparing] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Free the preview URLs of photos never uploaded.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(
    () => () => {
      for (const p of pendingRef.current) URL.revokeObjectURL(p.url);
    },
    [],
  );

  const kept = saved.filter((p) => !removed.includes(p.id));
  const count = kept.length + pending.length + preparing;
  const room = limit - count;

  async function addFiles(files: FileList | File[]) {
    setError(null);
    const chosen = Array.from(files).slice(0, Math.max(0, room));
    for (const file of chosen) {
      setPreparing((n) => n + 1);
      try {
        const blob = await shrinkPhoto(file);
        const key = `${file.name}-${Date.now()}-${Math.random()}`;
        setPending((list) => [...list, { key, blob, url: URL.createObjectURL(blob) }]);
      } catch (err) {
        setError(err instanceof PhotoReadError ? err.message : "That photo couldn't be added.");
      } finally {
        setPreparing((n) => n - 1);
      }
    }
  }

  /** Delete what she took off, then upload the new ones, one at a time. */
  async function commit(itemId: string, kind: HomeworkPhotoKind) {
    const toRemove = [...removed];
    const toUpload = [...pending];
    try {
      while (toRemove.length > 0) {
        const id = toRemove[0] as string;
        await deleteMyHomeworkPhoto(itemId, id);
        toRemove.shift();
        setSaved((list) => list.filter((p) => p.id !== id));
      }
      while (toUpload.length > 0) {
        const photo = toUpload[0] as PendingPhoto;
        const ref = await uploadMyHomeworkPhoto(itemId, photo.blob, kind);
        toUpload.shift();
        URL.revokeObjectURL(photo.url);
        setSaved((list) => [...list, ref]);
        setPending((list) => list.filter((p) => p.key !== photo.key));
      }
    } finally {
      setRemoved(toRemove);
    }
  }

  function reset(next: HomeworkPhotoRef[]) {
    for (const p of pending) URL.revokeObjectURL(p.url);
    setSaved(next);
    setRemoved([]);
    setPending([]);
    setError(null);
  }

  return {
    saved,
    kept,
    pending,
    preparing,
    count,
    room,
    limit,
    error,
    dirty: removed.length > 0 || pending.length > 0,
    addFiles,
    remove: (id: string) => setRemoved((list) => [...list, id]),
    unqueue: (key: string) => {
      const photo = pending.find((p) => p.key === key);
      if (photo) URL.revokeObjectURL(photo.url);
      setPending((list) => list.filter((p) => p.key !== key));
    },
    commit,
    reset,
  };
}

export type PhotoDraft = ReturnType<typeof usePhotoDraft>;

/**
 * A section's photo card: a drop zone while empty, then the photos as tiles (a
 * click opens the viewer) with an Add tile at the end — gone at the background
 * cap, which is not shown. Dropping photos anywhere on the card adds them.
 */
export function PhotoPanel({
  title,
  section,
  draft,
  itemId,
  disabled,
}: {
  title: string;
  section: PhotoSection;
  draft: PhotoDraft;
  itemId: string | null;
  disabled: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { count, room } = draft;
  const pick = () => fileInput.current?.click();

  const photos: ViewerPhoto[] = [
    ...draft.kept.map((p) => ({ key: p.id, src: itemId ? myHomeworkPhotoUrl(itemId, p.id) : "" })),
    ...draft.pending.map((p) => ({ key: p.key, src: p.url, note: "not saved yet" })),
  ];
  const pendingKeys = new Set(draft.pending.map((p) => p.key));

  return (
    <section
      aria-label={title}
      onDragOver={(e) => {
        if (room <= 0) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (room > 0) void draft.addFiles(e.dataTransfer.files);
      }}
      className={`space-y-3 rounded-lg bg-card p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors ${
        dragging ? "ring-2 ring-primary/60" : ""
      }`}
    >
      <p className="text-[13px] font-semibold">
        {title} <span className="font-normal text-muted-foreground">(optional)</span>
      </p>
      {count === 0 ? (
        <div
          className={`flex flex-col items-center gap-2 rounded-lg border-[1.5px] border-dashed px-3 py-6 text-center text-[13px] text-muted-foreground ${
            dragging ? "border-primary bg-primary/10" : ""
          }`}
        >
          <ImageIcon className="h-6 w-6 text-primary" />
          <p>Drop photos here, or</p>
          <Button type="button" variant="outline" size="sm" onClick={pick} disabled={disabled}>
            Choose photos
          </Button>
        </div>
      ) : (
        <PhotoGrid
          section={section}
          photos={photos}
          label={title}
          disabled={disabled}
          onRemove={(key) => (pendingKeys.has(key) ? draft.unqueue(key) : draft.remove(key))}
          after={
            <>
              {Array.from({ length: draft.preparing }, (_, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
                  key={i}
                  className="flex aspect-[4/3] items-center justify-center rounded-md bg-muted"
                >
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ))}
              {room > 0 ? (
                <button
                  type="button"
                  onClick={pick}
                  disabled={disabled}
                  className="flex aspect-[4/3] flex-col items-center justify-center gap-0.5 rounded-md border-[1.5px] border-dashed text-[12px] text-muted-foreground hover:border-primary/60 hover:text-foreground disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              ) : null}
            </>
          }
        />
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void draft.addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {draft.error ? <p className="text-[12px] text-destructive">{draft.error}</p> : null}
    </section>
  );
}
