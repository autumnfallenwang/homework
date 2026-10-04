"use client";

import { groupHomeworkItems, HOMEWORK_GROUP_TITLES, type HomeworkItem } from "@homework/shared";
import { Check, ChevronDown, ChevronRight, ImageIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { dueLabel } from "@/lib/homework-format";
import { KindBadge } from "./kind-badge";

/**
 * A child's homework list (ADR 0006, 0008), the same on both sides: grouped by
 * when things are due; items with a solution folded away as done. Read only on
 * both sides — the child opens an item to change it or add the solution.
 */
export function HomeworkList({
  items,
  today,
  mode,
  itemHref,
}: {
  items: HomeworkItem[];
  /** The server's local day the groups are counted from. */
  today: string;
  mode: "child" | "parent";
  itemHref: (item: HomeworkItem) => string;
}) {
  const [showDone, setShowDone] = useState(false);
  const groups = groupHomeworkItems(items, today);

  const row = (item: HomeworkItem) => (
    <HomeworkRow
      key={item.id}
      item={item}
      today={today}
      href={itemHref(item)}
      showEdited={mode === "parent"}
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

function HomeworkRow({
  item,
  today,
  href,
  showEdited,
}: {
  item: HomeworkItem;
  today: string;
  href: string;
  showEdited: boolean;
}) {
  const done = item.submittedAt !== null;
  const late = !done && item.dueOn < today;
  const photoCount = item.photos.length + item.solution.photos.length;
  return (
    <li>
      <Link
        href={href}
        className="group flex items-center gap-3 rounded-lg bg-card py-2.5 pr-4 pl-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
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
            {showEdited && item.edited ? <EditedBadge /> : null}
          </span>
        </span>
        <span
          className={`shrink-0 text-[12px] tabular-nums ${
            late ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted-foreground"
          }`}
        >
          {dueLabel(item.dueOn, today)}
        </span>
      </Link>
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
