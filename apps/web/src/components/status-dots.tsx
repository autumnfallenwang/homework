"use client";

import type { StatusHistoryEntry } from "@/lib/api";

interface StatusDotsProps {
  history: StatusHistoryEntry[];
  maxDots?: number;
}

function dotColor(status: string | null): string {
  switch (status) {
    case "meeting":
      return "bg-meeting";
    case "needs_attention":
      return "bg-attention";
    default:
      return "bg-ungraded";
  }
}

/**
 * 5 small colored circles showing the last N scrape statuses for a class.
 * Oldest on the left, newest on the right. Unfilled slots render as rings.
 */
export function StatusDots({ history, maxDots = 5 }: StatusDotsProps) {
  // history is newest-first from DB — reverse for left-to-right chronological
  const chronological = [...history].reverse();

  const dots: Array<{ key: string; filled: boolean; status: string | null }> = [];

  // Pad with empty slots on the left if fewer than maxDots
  const padCount = maxDots - chronological.length;
  for (let i = 0; i < padCount; i++) {
    dots.push({ key: `pad-${i}`, filled: false, status: null });
  }
  for (const entry of chronological) {
    dots.push({ key: `s-${entry.runAt}`, filled: true, status: entry.status });
  }

  return (
    <div className="flex items-center gap-1" role="img" aria-label="Status history">
      {dots.map((dot) => (
        <span
          key={dot.key}
          className={`inline-block h-2 w-2 rounded-full ${
            dot.filled
              ? `${dotColor(dot.status)} shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)]`
              : "border border-muted-foreground/25"
          }`}
        />
      ))}
    </div>
  );
}
