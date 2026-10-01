"use client";

import { HOMEWORK_LIMITS, type HomeworkClass, OTHER_CLASS_LABEL } from "@homework/shared";
import { ArrowDown, ArrowUp, Loader2, Plus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  ApiClientError,
  type ChildRecord,
  getHomeworkClasses,
  getHomeworkClassSuggestions,
  saveHomeworkClasses,
  setHomeworkSource,
} from "@/lib/api";

interface DraftClass {
  key: string;
  id?: string;
  name: string;
}

let draftKeys = 0;
const draft = (c: { id?: string; name: string }): DraftClass => ({
  key: `c${++draftKeys}`,
  ...c,
});

/** Client-side check before saving; the API checks the same. */
export function classListProblem(names: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const raw of names) {
    const name = raw.trim();
    if (!name) return "A class needs a name.";
    if (name.length > HOMEWORK_LIMITS.classNameMax) return `“${name}” is too long.`;
    const key = name.toLowerCase();
    if (key === OTHER_CLASS_LABEL.toLowerCase()) {
      return `“${OTHER_CLASS_LABEL}” is always offered, so it can't be a class.`;
    }
    if (seen.has(key)) return `“${name}” is listed twice.`;
    seen.add(key);
  }
  if (names.length > HOMEWORK_LIMITS.classesMax) {
    return `Up to ${HOMEWORK_LIMITS.classesMax} classes.`;
  }
  return null;
}

/**
 * On a child's card in Settings → Children (ADR 0006): the "Child enters
 * homework" switch and, while it is on, the classes the child picks from (plus
 * Other, always offered).
 */
export function HomeworkEntrySettings({
  child,
  onChanged,
}: {
  child: ChildRecord;
  onChanged: () => Promise<void>;
}) {
  const on = child.homeworkSource === "child";
  const [switching, setSwitching] = useState(false);
  const [classes, setClasses] = useState<HomeworkClass[] | null>(null);
  const [editing, setEditing] = useState<DraftClass[] | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setClasses(await getHomeworkClasses(child.id));
    } catch {
      setError("Could not load the classes.");
    }
  }, [child.id]);

  useEffect(() => {
    if (on) void load();
  }, [on, load]);

  async function toggle(next: boolean) {
    setSwitching(true);
    setError(null);
    try {
      await setHomeworkSource(child.id, next ? "child" : "page");
      await onChanged();
    } catch {
      setError("Could not change the setting.");
    } finally {
      setSwitching(false);
    }
  }

  function startEditing() {
    setMessage(null);
    setError(null);
    setNewName("");
    setEditing((classes ?? []).map((c) => draft({ id: c.id, name: c.name })));
  }

  function addDraft(name: string) {
    const trimmed = name.trim();
    if (!trimmed || !editing) return;
    setEditing([...editing, draft({ name: trimmed })]);
    setNewName("");
  }

  function move(index: number, by: -1 | 1) {
    if (!editing) return;
    const next = [...editing];
    const [row] = next.splice(index, 1);
    if (!row) return;
    next.splice(index + by, 0, row);
    setEditing(next);
  }

  async function fillFromTeacherEase() {
    if (!editing) return;
    setBusy(true);
    setMessage(null);
    try {
      const { names } = await getHomeworkClassSuggestions(child.id);
      const have = new Set(editing.map((c) => c.name.trim().toLowerCase()));
      const missing = names.filter((n) => !have.has(n.toLowerCase()));
      setEditing([...editing, ...missing.map((name) => draft({ name }))]);
      setMessage(
        names.length === 0
          ? "No TeacherEase classes yet — fetch grades first."
          : missing.length === 0
            ? "Every TeacherEase class is already in the list."
            : `Added ${missing.length} from TeacherEase. Rename or remove any before saving.`,
      );
    } catch {
      setError("Could not load the TeacherEase classes.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!editing) return;
    const rows = newName.trim() ? [...editing, draft({ name: newName.trim() })] : editing;
    const problem = classListProblem(rows.map((r) => r.name));
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setClasses(
        await saveHomeworkClasses(
          child.id,
          rows.map((r) => ({ ...(r.id ? { id: r.id } : {}), name: r.name.trim() })),
        ),
      );
      setEditing(null);
      setMessage(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.error : "Could not save the classes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2.5" data-testid="homework-entry">
      <div className="flex items-center justify-between gap-3">
        <span id={`hw-entry-${child.id}`} className="text-[13px] font-medium">
          Child enters homework
        </span>
        <Switch
          checked={on}
          onChange={(next) => void toggle(next)}
          disabled={switching}
          aria-label="Child enters homework"
        />
      </div>

      {on && !editing ? (
        <div className="flex items-start justify-between gap-3 text-[12px]">
          <p className="min-w-0 text-muted-foreground">
            <span className="font-medium text-foreground">Classes </span>
            {classes === null
              ? "…"
              : classes.length === 0
                ? `None yet, so ${child.displayName} can only pick ${OTHER_CLASS_LABEL}.`
                : `${classes.map((c) => c.name).join(" · ")} · ${OTHER_CLASS_LABEL}`}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2 text-[11px]"
            onClick={startEditing}
            disabled={classes === null}
          >
            Edit
          </Button>
        </div>
      ) : null}

      {on && editing ? (
        <div className="space-y-2 rounded-md border bg-background/60 p-3">
          <p className="text-[12px] text-muted-foreground">
            {`${child.displayName} picks one of these, or ${OTHER_CLASS_LABEL}. Renaming a class renames it on old homework too.`}
          </p>
          <ul className="space-y-1.5">
            {editing.map((row, i) => (
              <li key={row.key} className="flex items-center gap-1.5">
                <Input
                  value={row.name}
                  aria-label={`Class ${i + 1}`}
                  maxLength={HOMEWORK_LIMITS.classNameMax}
                  onChange={(e) =>
                    setEditing(
                      editing.map((r) => (r.key === row.key ? { ...r, name: e.target.value } : r)),
                    )
                  }
                  className="h-8 text-[13px]"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${row.name || "class"} up`}
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${row.name || "class"} down`}
                  onClick={() => move(i, 1)}
                  disabled={i === editing.length - 1}
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${row.name || "class"}`}
                  onClick={() => setEditing(editing.filter((r) => r.key !== row.key))}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              addDraft(newName);
            }}
          >
            <Input
              value={newName}
              placeholder="Add a class, e.g. Math"
              aria-label="New class"
              maxLength={HOMEWORK_LIMITS.classNameMax}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 text-[13px]"
            />
            <Button type="submit" variant="outline" size="sm" disabled={!newName.trim()}>
              <Plus />
              Add
            </Button>
          </form>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" onClick={() => void save()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              Save classes
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="link"
              size="sm"
              className="ml-auto px-0"
              onClick={() => void fillFromTeacherEase()}
              disabled={busy}
            >
              Fill from TeacherEase
            </Button>
          </div>
          {message ? <p className="text-[12px] text-muted-foreground">{message}</p> : null}
        </div>
      ) : null}

      {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
    </div>
  );
}
