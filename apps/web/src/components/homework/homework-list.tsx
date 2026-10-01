"use client";

import {
  groupHomeworkItems,
  HOMEWORK_GROUP_TITLES,
  type HomeworkDay,
  type HomeworkItem,
} from "@homework/shared";
import { Check, ChevronDown, ChevronRight, ImageIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { dueLabel, formatShortDay } from "@/lib/homework-format";
import { KindBadge } from "./kind-badge";

/**
 * A child's homework list (ADR 0006), the same on both sides: grouped by when
 * things are due, done items folded away, and today's "that's everything" line.
 * The child ticks items and marks the day; the parent only reads.
 */
export function HomeworkList({
  items,
  today,
  mode,
  childName,
  itemHref,
  onToggleDone,
  onDayComplete,
  busyIds = [],
}: {
  items: HomeworkItem[];
  today: HomeworkDay;
  mode: "child" | "parent";
  /** The child's name, for the parent's lines. */
  childName?: string;
  itemHref: (item: HomeworkItem) => string;
  onToggleDone?: (item: HomeworkItem) => void;
  onDayComplete?: (complete: boolean) => void;
  busyIds?: string[];
}) {
  const [showDone, setShowDone] = useState(false);
  const groups = groupHomeworkItems(items, today.date);
  const addedToday = items.filter((i) => i.assignedOn === today.date).length;
  const name = childName ?? "They";

  const completedAt = today.completedAt
    ? new Date(today.completedAt).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  const row = (item: HomeworkItem) => (
    <HomeworkRow
      key={item.id}
      item={item}
      today={today.date}
      href={itemHref(item)}
      onToggle={mode === "child" ? onToggleDone : undefined}
      busy={busyIds.includes(item.id)}
    />
  );

  return (
    <div className="space-y-4">
      <div
        className="flex min-h-[52px] flex-wrap items-center justify-between gap-2 rounded-lg bg-card px-4 py-2.5 text-[13px] text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
        data-testid="homework-day"
      >
        <span>
          <span className="font-semibold text-foreground">Today</span>
          {` · ${formatShortDay(today.date)} · ${addedToday} added`}
        </span>
        {mode === "child" ? (
          completedAt ? (
            <span className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-meeting">
                <Check className="h-3.5 w-3.5" />
                {addedToday > 0 ? "Today is complete" : "No homework today"} · {completedAt}
              </span>
              <Button variant="ghost" size="sm" onClick={() => onDayComplete?.(false)}>
                Undo
              </Button>
            </span>
          ) : (
            <Button variant="outline" size="sm" onClick={() => onDayComplete?.(true)}>
              {addedToday > 0 ? "That's everything for today" : "No homework today"}
            </Button>
          )
        ) : completedAt ? (
          <span className="flex items-center gap-1.5 text-meeting">
            <Check className="h-3.5 w-3.5" />
            {addedToday > 0
              ? `${name} marked today complete at ${completedAt}`
              : `${name} marked no homework today (${completedAt})`}
          </span>
        ) : (
          <span>{`${name} hasn't marked today complete yet`}</span>
        )}
      </div>

      {groups.open.length === 0 && groups.done.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-card/60 px-4 py-6 text-center text-[13px] text-muted-foreground">
          {mode === "child"
            ? "No homework yet. Add it when you get some."
            : `${name} hasn't added any homework yet.`}
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
  onToggle,
  busy,
}: {
  item: HomeworkItem;
  today: string;
  href: string;
  onToggle?: (item: HomeworkItem) => void;
  busy: boolean;
}) {
  const done = item.status === "done";
  const late = !done && item.dueOn < today;
  const circle = `flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
    done ? "border-meeting bg-meeting text-white" : "border-muted-foreground/70"
  }`;
  return (
    <li className="flex items-center gap-3 rounded-lg bg-card py-2.5 pr-4 pl-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {onToggle ? (
        <button
          type="button"
          className={`${circle} transition-colors hover:border-meeting disabled:opacity-50`}
          aria-label={`${done ? "Mark not done" : "Mark done"}: ${item.title}`}
          onClick={() => onToggle(item)}
          disabled={busy}
        >
          {done ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
        </button>
      ) : (
        <span
          className={`${circle} ${done ? "" : "border-dashed"}`}
          title={done ? "Done" : "To do"}
        >
          {done ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
        </span>
      )}
      <Link href={href} className="group min-w-0 flex-1">
        <span
          className={`block text-[14px] font-medium [overflow-wrap:anywhere] group-hover:text-primary ${
            done ? "text-muted-foreground line-through" : ""
          }`}
        >
          {item.title}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
          <span>{item.className}</span>
          <KindBadge kind={item.kind} />
          {item.photos.length > 0 ? (
            <span
              className="inline-flex items-center gap-0.5"
              title={`${item.photos.length} photo${item.photos.length === 1 ? "" : "s"}`}
            >
              <ImageIcon className="h-3 w-3" />
              {item.photos.length}
            </span>
          ) : null}
        </span>
      </Link>
      <span
        className={`shrink-0 text-[12px] tabular-nums ${
          late ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted-foreground"
        }`}
      >
        {dueLabel(item.dueOn, today)}
      </span>
    </li>
  );
}
