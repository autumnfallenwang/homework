"use client";

import type { HomeworkItem, HomeworkItemList } from "@homework/shared";
import { BookOpen, Check, Clock, Target } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { getChildHomeworkItems } from "@/lib/api";
import { formatShortDay } from "@/lib/homework-format";
import { KindBadge } from "./kind-badge";

/**
 * Today's homework for a child who enters their own (ADR 0006): what they added
 * today and what is due today, the same two sections the class page fills, plus
 * whether they marked the day complete.
 */
export function EnteredHomeworkToday({
  childId,
  childName,
  refreshKey,
}: {
  childId: string;
  childName: string;
  refreshKey: number;
}) {
  const [list, setList] = useState<HomeworkItemList | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey re-runs the load on purpose
  useEffect(() => {
    let live = true;
    getChildHomeworkItems(childId)
      .then((l) => live && setList(l))
      .catch(() => live && setList(null));
    return () => {
      live = false;
    };
  }, [childId, refreshKey]);

  if (!list) return null;
  const today = list.today.date;
  const forToday = list.items.filter((i) => i.assignedOn === today);
  const dueToday = list.items.filter((i) => i.dueOn === today);
  const completedAt = list.today.completedAt
    ? new Date(list.today.completedAt).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="space-y-5" data-testid="entered-homework-today">
      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-1 text-[12.5px] text-muted-foreground">
        <span className="rounded-full bg-primary/10 px-2 py-px text-[11px] font-medium text-primary">
          Entered by {childName}
        </span>
        {completedAt ? (
          <span className="flex items-center gap-1 text-meeting">
            <Check className="h-3.5 w-3.5" />
            {forToday.length > 0
              ? `${childName} marked today complete at ${completedAt}`
              : `${childName} marked no homework today (${completedAt})`}
          </span>
        ) : (
          <span>
            {forToday.length > 0
              ? `${childName} has added ${forToday.length} today and hasn't marked the day complete`
              : `${childName} hasn't added anything today`}
          </span>
        )}
        <Link href="/review" className="ml-auto text-primary underline-offset-4 hover:underline">
          All homework →
        </Link>
      </p>
      <Section
        icon={<BookOpen className="h-4 w-4 text-primary" />}
        title="Homework for today"
        items={forToday}
        empty="Nothing added today"
      />
      <Section
        icon={<Target className="h-4 w-4 text-primary" />}
        title="Due today"
        items={dueToday}
        empty="Nothing due today"
      />
    </div>
  );
}

function Section({
  icon,
  title,
  items,
  empty,
}: {
  icon: ReactNode;
  title: string;
  items: HomeworkItem[];
  empty: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        {icon}
        <h2 className="text-lg font-medium" style={{ fontFamily: "var(--font-heading)" }}>
          {title}
        </h2>
        {items.length > 0 ? (
          <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
            {items.length}
          </span>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/80 bg-card/60 px-4 py-2.5 text-[12px] italic text-muted-foreground">
          {empty}
        </p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/review/homework/${item.id}`}
              className="block rounded-lg border border-border bg-card px-4 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-primary/40"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                    {item.className}
                    <KindBadge kind={item.kind} />
                    {item.status === "done" ? (
                      <span className="flex items-center gap-0.5 text-[11px] font-medium text-meeting">
                        <Check className="h-3 w-3" />
                        Done
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[12px] text-muted-foreground [overflow-wrap:anywhere]">
                    {item.title}
                    {item.details ? ` — ${item.details}` : ""}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatShortDay(item.dueOn)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
