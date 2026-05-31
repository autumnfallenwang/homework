"use client";

import { Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { type ReactElement, useState } from "react";
import type { ActivityItem } from "@/lib/core/activity";

interface RecentActivityProps {
  activities: ActivityItem[];
}

const VISIBLE_LIMIT = 5;

function formatScore(n: number): string {
  return n.toFixed(2);
}

function renderItem(item: ActivityItem): { icon: ReactElement; text: string } {
  switch (item.type) {
    case "improved":
      return {
        icon: <TrendingUp className="h-4 w-4 shrink-0 text-meeting" />,
        text: `${item.className} improved ${formatScore(item.scoreFrom ?? 0)} → ${formatScore(item.scoreTo ?? 0)}`,
      };
    case "declined":
      return {
        icon: <TrendingDown className="h-4 w-4 shrink-0 text-attention" />,
        text: `${item.className} declined ${formatScore(item.scoreFrom ?? 0)} → ${formatScore(item.scoreTo ?? 0)}`,
      };
    case "newScores": {
      const n = item.count ?? 0;
      return {
        icon: <Sparkles className="h-4 w-4 shrink-0 text-primary" />,
        text:
          n === 1 ? `${n} new score in ${item.className}` : `${n} new scores in ${item.className}`,
      };
    }
  }
}

function itemKey(item: ActivityItem, idx: number): string {
  return `${item.type}:${item.className}:${idx}`;
}

export function RecentActivity({ activities }: RecentActivityProps) {
  const [showAll, setShowAll] = useState(false);

  if (activities.length === 0) return null;

  const overflow = activities.length - VISIBLE_LIMIT;
  const visible = showAll ? activities : activities.slice(0, VISIBLE_LIMIT);

  return (
    <div className="border-t border-border/30 pt-3">
      <p className="mb-2 px-1 text-[11px] uppercase tracking-wider text-muted-foreground">
        Recent activity
      </p>
      <ul className="space-y-1">
        {visible.map((item, idx) => {
          const { icon, text } = renderItem(item);
          return (
            <li key={itemKey(item, idx)} className="flex items-center gap-2 px-1 py-1">
              {icon}
              <span className="text-[12px]">{text}</span>
            </li>
          );
        })}
      </ul>
      {overflow > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="px-1 pt-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {showAll ? "Show less" : `Show ${overflow} more`}
        </button>
      )}
    </div>
  );
}
