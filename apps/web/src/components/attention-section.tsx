"use client";

import { type AttentionItem, sortItemsMissingFirst } from "@homework/shared";
import { AlertTriangle, BookX, ChevronRight, Clock, TrendingDown } from "lucide-react";
import { useState } from "react";

interface AttentionSectionProps {
  withinWindow: AttentionItem[];
  agedOut: AttentionItem[];
}

function parsePortalDate(iso: string): Date | null {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatPortalDate(iso: string): string {
  const d = parsePortalDate(iso);
  if (!d) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const { assignment, reason, className, withinWindow } = item;
  const isMissing = reason === "missing";

  // Aged-out rows drop the amber tint entirely and mute the icon — consistent
  // with the standards-tree treatment for the same items.
  let rowClass = "border-border";
  let iconClass = "text-muted-foreground";
  if (withinWindow) {
    if (isMissing) {
      rowClass = "border-attention/20 bg-attention/5";
      iconClass = "text-attention";
    } else {
      rowClass = "border-border bg-amber-50/30 dark:bg-amber-950/10";
      iconClass = "text-attention/60";
    }
  }

  return (
    <div className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 ${rowClass}`}>
      {isMissing ? (
        <BookX className={`h-3.5 w-3.5 shrink-0 ${iconClass}`} />
      ) : (
        <TrendingDown className={`h-3.5 w-3.5 shrink-0 ${iconClass}`} />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{assignment.name}</p>
        <p className="text-[11px] text-muted-foreground">{className}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!isMissing && assignment.grade && (
          <span className="text-[12px] font-semibold tabular-nums text-muted-foreground">
            {assignment.grade}
          </span>
        )}
        {assignment.dueDate && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatPortalDate(assignment.dueDate)}
          </span>
        )}
      </div>
    </div>
  );
}

export function AttentionSection({ withinWindow, agedOut }: AttentionSectionProps) {
  const recent = sortItemsMissingFirst(withinWindow);
  const older = sortItemsMissingFirst(agedOut);
  const totalCount = recent.length + older.length;
  const [olderExpanded, setOlderExpanded] = useState(false);

  if (totalCount === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <AlertTriangle className="h-4 w-4 text-attention" />
        <h2 className="text-lg font-medium" style={{ fontFamily: "var(--font-heading)" }}>
          Needs attention
        </h2>
        <span className="ml-auto rounded-full bg-attention/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-attention-foreground">
          {totalCount}
        </span>
      </div>

      {/* Within forgiveness window — expanded by default */}
      {recent.length > 0 && (
        <div className="space-y-1.5">
          <p className="px-1 text-[11px] uppercase tracking-wider text-muted-foreground">Recent</p>
          {recent.map((item) => (
            <AttentionRow
              key={`${item.className}-${item.assignment.testNameId}-${item.reason}`}
              item={item}
            />
          ))}
        </div>
      )}

      {/* Aged out — collapsed by default */}
      {older.length > 0 && (
        <div>
          <button
            type="button"
            className="flex w-full items-center gap-1 px-1 py-1 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            onClick={() => setOlderExpanded((prev) => !prev)}
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform duration-200 ${olderExpanded ? "rotate-90" : ""}`}
            />
            {`${older.length} older`}
          </button>
          <div
            className="grid transition-[grid-template-rows] duration-200 ease-out"
            style={{ gridTemplateRows: olderExpanded ? "1fr" : "0fr" }}
          >
            <div className="space-y-1.5 overflow-hidden">
              {older.map((item) => (
                <AttentionRow
                  key={`${item.className}-${item.assignment.testNameId}-${item.reason}`}
                  item={item}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
