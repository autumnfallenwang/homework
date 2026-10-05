"use client";

import { groupHomeworkItems, HOMEWORK_GROUP_TITLES, type HomeworkItem } from "@homework/shared";
import { Check, ChevronDown, ChevronRight, EllipsisVertical, ImageIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiClientError, deleteHomeworkItem, deleteMyHomework } from "@/lib/api";
import { dueLabel } from "@/lib/homework-format";
import { describeHomeworkError, firstDayOver } from "./homework-form";
import { KindBadge } from "./kind-badge";

/**
 * A child's homework list (ADR 0006, 0008), the same on both sides: grouped by
 * when things are due; submitted items folded away as done. Each row opens the
 * item; its ⋮ menu has Edit (child) or View (parent), and Delete — the child's
 * on the first day only, the parent's always (ADR 0012) — confirmed in the row.
 */
export function HomeworkList({
  items,
  today,
  mode,
  itemHref,
  onDeleted,
}: {
  items: HomeworkItem[];
  /** The server's local day the groups are counted from. */
  today: string;
  mode: "child" | "parent";
  itemHref: (item: HomeworkItem) => string;
  /** The item is gone on the server; drop it from the list. */
  onDeleted: (itemId: string) => void;
}) {
  const [showDone, setShowDone] = useState(false);
  const groups = groupHomeworkItems(items, today);

  const row = (item: HomeworkItem) => (
    <HomeworkRow
      key={item.id}
      item={item}
      today={today}
      href={itemHref(item)}
      mode={mode}
      onDeleted={() => onDeleted(item.id)}
    />
  );

  return (
    <div className="space-y-4">
      {groups.open.length === 0 && groups.done.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-card/60 px-4 py-6 text-center text-[13px] text-muted-foreground">
          No homework yet.
        </p>
      ) : null}

      {groups.open.map((g) => (
        <section key={g.key} className="space-y-1.5" aria-label={HOMEWORK_GROUP_TITLES[g.key]}>
          <h2
            className={`flex justify-between px-0.5 text-[11px] font-semibold uppercase tracking-wider ${
              g.key === "overdue" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"
            }`}
          >
            <span>{HOMEWORK_GROUP_TITLES[g.key]}</span>
            <span className="tabular-nums">{g.items.length}</span>
          </h2>
          <ul className="space-y-1.5">{g.items.map(row)}</ul>
        </section>
      ))}

      {groups.done.length > 0 ? (
        <section className="space-y-1.5" aria-label="Done">
          <button
            type="button"
            className="flex items-center gap-1 px-0.5 py-1 text-[12px] text-muted-foreground hover:text-foreground"
            aria-expanded={showDone}
            onClick={() => setShowDone((v) => !v)}
          >
            {showDone ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            Done · {groups.done.length}
          </button>
          {showDone ? <ul className="space-y-1.5">{groups.done.map(row)}</ul> : null}
        </section>
      ) : null}
    </div>
  );
}

function deleteError(err: unknown, mode: "child" | "parent"): string {
  if (mode === "child") return describeHomeworkError(err);
  return err instanceof ApiClientError && err.status === 404
    ? "This homework no longer exists."
    : "Could not delete this homework.";
}

function HomeworkRow({
  item,
  today,
  href,
  mode,
  onDeleted,
}: {
  item: HomeworkItem;
  today: string;
  href: string;
  mode: "child" | "parent";
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const pickedDelete = useRef(false);
  const done = item.submittedAt !== null;
  const late = !done && item.dueOn < today;
  const dueTone = late ? "font-semibold text-amber-700 dark:text-amber-400" : "";
  const photoCount = item.photos.length + item.solution.photos.length;
  // The child's Delete follows the item page: the first day only (ADR 0008).
  const canDelete = mode === "parent" || !firstDayOver(item);

  // The row has swapped its ⋮ button for the question: start on the safe answer.
  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await (mode === "parent" ? deleteHomeworkItem(item.id) : deleteMyHomework(item.id));
      onDeleted();
    } catch (err) {
      setError(deleteError(err, mode));
      setConfirming(false);
      setDeleting(false);
    }
  }

  return (
    <li className="@container rounded-lg bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {confirming ? (
        <div className="flex min-h-[58px] flex-wrap items-center gap-2 py-2 pr-2 pl-4">
          <span className="min-w-0 flex-1 text-[13px] [overflow-wrap:anywhere]">
            Delete “{item.title}”?
          </span>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => void remove()}
            disabled={deleting}
          >
            Delete
          </Button>
          <Button
            ref={keepRef}
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setConfirming(false)}
            disabled={deleting}
          >
            Keep
          </Button>
        </div>
      ) : (
        <div className="flex items-center">
          <Link
            href={href}
            className="group flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-2 pl-3"
          >
            <span
              className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                done
                  ? "border-meeting bg-meeting text-white"
                  : "border-dashed border-muted-foreground/70"
              }`}
              title={done ? "Submitted" : "Not submitted yet"}
            >
              {done ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={`block text-[14px] font-medium [overflow-wrap:anywhere] group-hover:text-primary ${
                  done ? "text-muted-foreground" : ""
                }`}
              >
                {item.title}
              </span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
                {/* A narrow row (the parent's sidebar open on a phone) has no room on the right. */}
                <span className={`@xs:hidden tabular-nums ${dueTone}`}>
                  {dueLabel(item.dueOn, today)}
                </span>
                <span>{item.className}</span>
                <KindBadge kind={item.kind} />
                {photoCount > 0 ? (
                  <span
                    className="inline-flex items-center gap-0.5"
                    title={`${photoCount} photo${photoCount === 1 ? "" : "s"}`}
                  >
                    <ImageIcon className="h-3 w-3" />
                    {photoCount}
                  </span>
                ) : null}
                {mode === "parent" && item.edited ? <EditedBadge /> : null}
              </span>
            </span>
            <span
              className={`hidden shrink-0 text-[12px] tabular-nums @xs:block ${dueTone || "text-muted-foreground"}`}
            >
              {dueLabel(item.dueOn, today)}
            </span>
          </Link>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-muted"
                aria-label={`Actions for “${item.title}”`}
              >
                <EllipsisVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              onCloseAutoFocus={(e) => {
                // Delete swaps the ⋮ button out: focus goes to Keep instead.
                if (pickedDelete.current) e.preventDefault();
                pickedDelete.current = false;
              }}
            >
              <DropdownMenuItem asChild>
                <Link href={href}>{mode === "parent" ? "View" : "Edit"}</Link>
              </DropdownMenuItem>
              {canDelete ? (
                <DropdownMenuItem
                  destructive
                  onSelect={() => {
                    pickedDelete.current = true;
                    setConfirming(true);
                  }}
                >
                  Delete
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      {error ? <p className="px-4 pb-2.5 text-[12px] text-destructive">{error}</p> : null}
    </li>
  );
}

/** Changes were recorded after the first day — the parent's cue to open the history. */
export function EditedBadge() {
  return (
    <span
      className="rounded px-1.5 py-px text-[11px] font-medium bg-amber-500/15 text-amber-800 dark:text-amber-300"
      title="Changed after the first day — see the history"
    >
      Edited
    </span>
  );
}
