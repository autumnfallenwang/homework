"use client";

import {
  HOMEWORK_KIND_LABELS,
  HOMEWORK_LIMITS,
  type HomeworkClass,
  type HomeworkItem,
  type HomeworkKind,
  type HomeworkPhotoRef,
  nextSchoolDay,
  OTHER_CLASS_LABEL,
} from "@homework/shared";
import { ImageIcon, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApiClientError,
  createMyHomework,
  deleteMyHomework,
  deleteMyHomeworkPhoto,
  myHomeworkPhotoUrl,
  updateMyHomework,
  uploadMyHomeworkPhoto,
} from "@/lib/api";
import { formatAddedAt } from "@/lib/homework-format";
import { PhotoReadError, shrinkPhoto } from "@/lib/photo-shrink";
import { type ChipOption, ChoiceChips } from "./choice-chips";

const OTHER = "__other";

const KIND_OPTIONS: ChipOption<HomeworkKind>[] = (
  Object.keys(HOMEWORK_KIND_LABELS) as HomeworkKind[]
).map((k) => ({ value: k, label: HOMEWORK_KIND_LABELS[k] }));

interface PendingPhoto {
  key: string;
  blob: Blob;
  url: string;
}

export function describeHomeworkError(err: unknown): string {
  if (err instanceof ApiClientError) {
    const code = (err.body as { code?: string }).code;
    if (code === "entry_off") return "Homework entry is off. Ask a parent to turn it on.";
    if (err.status === 400 && err.body.error === "Validation failed") {
      return "Check the class, what to do and the due date.";
    }
    return err.body.error;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

/**
 * The child's Add homework page, and the same page filled in for editing
 * (ADR 0006). Class and type are single-choice chips; the due date is a plain
 * date input starting at the next school day; photos are shrunk in the browser
 * and uploaded after the item is saved.
 */
export function HomeworkForm({
  item,
  classes,
  today,
}: {
  item: HomeworkItem | null;
  classes: HomeworkClass[];
  today: string;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const firstChoice = classes.length === 0 ? OTHER : null;

  const [itemId, setItemId] = useState<string | null>(item?.id ?? null);
  const [classChoice, setClassChoice] = useState<string | null>(
    item ? (item.classId ?? OTHER) : firstChoice,
  );
  const [kind, setKind] = useState<HomeworkKind>(item?.kind ?? "homework");
  const [title, setTitle] = useState(item?.title ?? "");
  const [details, setDetails] = useState(item?.details ?? "");
  const [dueOn, setDueOn] = useState(item?.dueOn ?? nextSchoolDay(today));
  const [saved, setSaved] = useState<HomeworkPhotoRef[]>(item?.photos ?? []);
  const [removed, setRemoved] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [preparing, setPreparing] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Free the preview URLs of photos never uploaded.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(
    () => () => {
      for (const p of pendingRef.current) URL.revokeObjectURL(p.url);
    },
    [],
  );

  const classOptions: ChipOption<string>[] = classes.map((c) => ({ value: c.id, label: c.name }));
  // An item may still sit in a class the parent has since removed.
  if (item?.classId && !classes.some((c) => c.id === item.classId)) {
    classOptions.push({ value: item.classId, label: item.className });
  }
  classOptions.push({ value: OTHER, label: OTHER_CLASS_LABEL, fixed: true });

  const keptPhotos = saved.filter((p) => !removed.includes(p.id));
  const photoCount = keptPhotos.length + pending.length + preparing;
  const roomForPhotos = HOMEWORK_LIMITS.photosPerItem - photoCount;

  async function addFiles(files: FileList | File[]) {
    setError(null);
    const chosen = Array.from(files).slice(0, Math.max(0, roomForPhotos));
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

  function resetForNext() {
    setItemId(null);
    setClassChoice(firstChoice);
    setKind("homework");
    setTitle("");
    setDetails("");
    setSaved([]);
    setRemoved([]);
    setPending([]);
  }

  async function save(another: boolean) {
    setError(null);
    setNotice(null);
    if (!classChoice) return setError("Pick a class.");
    if (!title.trim()) return setError("Write what to do.");
    if (!dueOn) return setError("Pick the due date.");
    setSaving(true);
    const toRemove = [...removed];
    const toUpload = [...pending];
    try {
      const input = {
        classId: classChoice === OTHER ? null : classChoice,
        kind,
        title: title.trim(),
        details: details.trim() || null,
        dueOn,
      };
      const current = itemId
        ? await updateMyHomework(itemId, input)
        : await createMyHomework(input);
      setItemId(current.id);
      while (toRemove.length > 0) {
        const id = toRemove[0] as string;
        await deleteMyHomeworkPhoto(current.id, id);
        toRemove.shift();
        setSaved((list) => list.filter((p) => p.id !== id));
      }
      while (toUpload.length > 0) {
        const photo = toUpload[0] as PendingPhoto;
        const ref = await uploadMyHomeworkPhoto(current.id, photo.blob);
        toUpload.shift();
        URL.revokeObjectURL(photo.url);
        setSaved((list) => [...list, ref]);
        setPending((list) => list.filter((p) => p.key !== photo.key));
      }
      if (another) {
        resetForNext();
        setNotice(`Added “${input.title}”. Next one?`);
      } else {
        router.push("/child");
      }
    } catch (err) {
      setError(describeHomeworkError(err));
    } finally {
      setRemoved(toRemove);
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
      setSaving(false);
    }
  }

  const busy = saving || preparing > 0;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-5 md:px-6">
      <Link href="/child" className="text-[13px] text-muted-foreground hover:text-foreground">
        ← Homework
      </Link>
      {item ? (
        <p className="mt-1 text-[12px] text-muted-foreground">
          Added {formatAddedAt(item.createdAt)}
        </p>
      ) : null}

      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
        noValidate
      >
        <div className="grid gap-7 md:grid-cols-[minmax(0,1fr)_300px] md:items-start">
          <div className="space-y-5">
            <ChoiceChips
              legend="Class"
              options={classOptions}
              value={classChoice}
              onChange={setClassChoice}
            />
            <ChoiceChips legend="Type" options={KIND_OPTIONS} value={kind} onChange={setKind} />
            <div className="space-y-2">
              <Label htmlFor="hw-title" className="text-[12px] font-semibold">
                What to do
              </Label>
              <Input
                id="hw-title"
                value={title}
                maxLength={HOMEWORK_LIMITS.titleMax}
                placeholder="e.g. Homework #6, or read ch. 6 + worksheet"
                onChange={(e) => setTitle(e.target.value)}
              />
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
            <div className="space-y-2">
              <Label htmlFor="hw-due" className="text-[12px] font-semibold">
                {kind === "test" ? "Test day" : "Due"}
              </Label>
              <Input
                id="hw-due"
                type="date"
                value={dueOn}
                onChange={(e) => setDueOn(e.target.value)}
                className="w-[200px]"
              />
            </div>
          </div>

          <div className="space-y-3 rounded-lg bg-card p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-baseline justify-between">
              <p className="text-[13px] font-semibold">
                Photos <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <span className="text-[12px] tabular-nums text-muted-foreground">
                {photoCount} of {HOMEWORK_LIMITS.photosPerItem}
              </span>
            </div>
            {roomForPhotos > 0 ? (
              <section
                aria-label="Add photos"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  void addFiles(e.dataTransfer.files);
                }}
                className={`flex flex-col items-center gap-2 rounded-lg border-[1.5px] border-dashed text-center text-[13px] text-muted-foreground transition-colors ${
                  dragging ? "border-primary bg-primary/10" : ""
                } ${photoCount > 0 ? "p-3" : "px-3 py-6"}`}
              >
                {photoCount === 0 ? (
                  <>
                    <ImageIcon className="h-6 w-6 text-primary" />
                    <p>Drop photos here, or</p>
                  </>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInput.current?.click()}
                  disabled={busy}
                >
                  {photoCount > 0 ? "Add more photos" : "Choose photos"}
                </Button>
                {photoCount === 0 ? (
                  <p className="text-[12px]">The worksheet, the board, your planner</p>
                ) : null}
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    if (e.target.files) void addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </section>
            ) : null}
            {photoCount > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {keptPhotos.map((p, i) => (
                  <PhotoThumb
                    key={p.id}
                    src={itemId ? myHomeworkPhotoUrl(itemId, p.id) : ""}
                    index={i + 1}
                    onRemove={() => setRemoved((list) => [...list, p.id])}
                    disabled={busy}
                  />
                ))}
                {pending.map((p, i) => (
                  <PhotoThumb
                    key={p.key}
                    src={p.url}
                    index={keptPhotos.length + i + 1}
                    onRemove={() => {
                      URL.revokeObjectURL(p.url);
                      setPending((list) => list.filter((x) => x.key !== p.key));
                    }}
                    disabled={busy}
                  />
                ))}
                {Array.from({ length: preparing }, (_, i) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
                    key={i}
                    className="flex aspect-[4/3] items-center justify-center rounded-md bg-muted"
                  >
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
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
                Save
              </Button>
              {item ? null : (
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
              <Button type="button" size="lg" variant="ghost" asChild>
                <Link href="/child">Cancel</Link>
              </Button>
            </>
          )}
          <span className="flex-1 text-[13px]" role="status">
            {error ? <span className="text-destructive">{error}</span> : null}
            {notice && !error ? <span className="text-meeting">{notice}</span> : null}
          </span>
          {item && !confirmingDelete ? (
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={() => setConfirmingDelete(true)}
              disabled={busy}
            >
              Delete
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function PhotoThumb({
  src,
  index,
  onRemove,
  disabled,
}: {
  src: string;
  index: number;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-muted">
      {/* biome-ignore lint/performance/noImgElement: photos come from the API with the session cookie */}
      <img src={src} alt={`Attachment ${index}`} className="h-full w-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove photo ${index}`}
        className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/75"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
