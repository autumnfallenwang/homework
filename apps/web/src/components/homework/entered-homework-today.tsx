"use client";

import {
  type HomeworkItem,
  type HomeworkItemList,
  nextDueDay,
  relativeDueDay,
} from "@homework/shared";
import { BookOpen, Check, Clock, Target } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { getChildHomeworkItems } from "@/lib/api";
import { formatShortDay } from "@/lib/homework-format";
import { KindBadge } from "./kind-badge";

/**
 * Today's homework for a child who enters their own (ADR 0006, 0007): what was
 * given today (by the given-on day the child picked) and what is due on the next
 * hand-in day ("due tomorrow", Monday from a Friday), the
 * same two sections the class page fills.
 */
export function EnteredHomeworkToday({
  childId,
  refreshKey,
}: {
  childId: string;
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
  const forToday = list.items.filter((i) => i.assignedOn === list.today);
  const dueDay = nextDueDay(list.today);
  const dueLabel = relativeDueDay(dueDay, list.today);
  const dueNext = list.items.filter((i) => i.dueOn === dueDay);

  return (
    <div className="space-y-5" data-testid="entered-homework-today">
      <Section
        icon={<BookOpen className="h-4 w-4 text-primary" />}
        title="Homework for today"
        items={forToday}
        empty="Nothing given today"
      />
      <Section
        icon={<Target className="h-4 w-4 text-primary" />}
        title={`Due ${dueLabel}`}
        items={dueNext}
        empty={`Nothing due ${dueLabel}`}
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
                    {item.hasSolution ? (
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
