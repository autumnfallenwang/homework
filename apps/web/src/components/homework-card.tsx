"use client";

import { BookOpen, Clock, Target } from "lucide-react";
import type { HomeworkRecord } from "@/lib/api";

function parseIsoDay(iso: string): Date | null {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatHomeworkDate(iso: string): string {
  const d = parseIsoDay(iso);
  if (!d) return iso;
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(d);
  const month = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
  return `${weekday} · ${month}`;
}

export function formatDueChip(iso: string, inferred: boolean): string {
  const d = parseIsoDay(iso);
  if (!d) return iso;
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(d);
  const mm = d.getUTCMonth() + 1;
  const dd = d.getUTCDate();
  const label = `${weekday} ${mm}/${dd}`;
  return inferred ? `~${label}` : label;
}

export function isEmptyContent(content: string): boolean {
  const t = content.trim();
  return t === "" || t.toLowerCase() === "none";
}

export function HomeworkRow({ entry }: { entry: HomeworkRecord }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium">{entry.subject}</p>
          {isEmptyContent(entry.content) ? (
            <p className="text-[12px] text-muted-foreground">—</p>
          ) : (
            <p className="whitespace-pre-line text-[12px] text-muted-foreground">{entry.content}</p>
          )}
        </div>
        {entry.dueDate && (
          <span
            className={`flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] ${
              entry.dueDateInferred ? "italic text-muted-foreground/70" : "text-muted-foreground"
            }`}
            title={entry.dueDateInferred ? "Due date inferred from posting date" : undefined}
          >
            <Clock className="h-3 w-3" />
            {formatDueChip(entry.dueDate, entry.dueDateInferred)}
          </span>
        )}
      </div>
    </div>
  );
}

function SectionEmpty({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border/80 bg-card/60 px-4 py-2.5 text-[12px] italic text-muted-foreground">
      {text}
    </p>
  );
}

function SectionHeading({
  icon,
  title,
  count,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 px-1">
      {icon}
      <h2 className="text-lg font-medium" style={{ fontFamily: "var(--font-heading)" }}>
        {title}
      </h2>
      {count > 0 && (
        <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
    </div>
  );
}

interface HomeworkTodaySectionsProps {
  forToday: HomeworkRecord[];
  dueToday: HomeworkRecord[];
}

export function HomeworkTodaySections({ forToday, dueToday }: HomeworkTodaySectionsProps) {
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <SectionHeading
          icon={<BookOpen className="h-4 w-4 text-primary" />}
          title="Homework for today"
          count={forToday.length}
        />
        {forToday.length === 0 ? (
          <SectionEmpty text="No homework recorded for today" />
        ) : (
          <div className="space-y-1.5">
            {forToday.map((entry) => (
              <HomeworkRow key={`for-${entry.id}`} entry={entry} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading
          icon={<Target className="h-4 w-4 text-primary" />}
          title="Due today"
          count={dueToday.length}
        />
        {dueToday.length === 0 ? (
          <SectionEmpty text="Nothing due today" />
        ) : (
          <div className="space-y-1.5">
            {dueToday.map((entry) => (
              <HomeworkRow key={`due-${entry.id}`} entry={entry} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
