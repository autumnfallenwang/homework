"use client";

import { computeTrend, type TrendDirection } from "@homework/shared";
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleDashed,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { ReactNode } from "react";
import { ProgressBar } from "@/components/progress-bar";
import { StatusDots } from "@/components/status-dots";
import type { GradeRecord, StatusHistoryEntry } from "@/lib/api";
import { sortClassesByUrgency } from "@/lib/core/sort";

interface GradesTableProps {
  grades: GradeRecord[];
  history: Record<string, StatusHistoryEntry[]>;
  instructors: Map<string, string>;
  /** Engine-flagged attention class names (per Q25 AT4). Drives the
   *  "Needs Attention" badge + urgency sort. TeacherEase `status` still drives
   *  the orthogonal "Meeting" / "Not Assessed" badges on non-attention rows. */
  attentionClassNames: ReadonlySet<string>;
  expandedClass: string | null;
  onClassClick: (className: string) => void;
  children?: (className: string) => ReactNode;
}

function getClassTabColor(className: string): string {
  const name = className.toLowerCase();
  if (name.includes("math")) return "class-tab-math";
  if (name.includes("science")) return "class-tab-science";
  if (name.includes("english")) return "class-tab-english";
  if (name.includes("social")) return "class-tab-social";
  if (name.includes("french")) return "class-tab-french";
  if (name.includes("art")) return "class-tab-art";
  if (name.includes("music")) return "class-tab-music";
  if (name.includes("physical") || name.includes("pe ")) return "class-tab-pe";
  if (name.includes("computer")) return "class-tab-cs";
  if (name.includes("health")) return "class-tab-health";
  return "class-tab-default";
}

function StatusIndicator({ grade, isAttention }: { grade: GradeRecord; isAttention: boolean }) {
  if (isAttention) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-attention/15 px-2.5 py-1 text-xs font-medium text-attention-foreground">
        <CircleAlert className="h-3 w-3 fill-attention text-attention" />
        Needs Attention
      </span>
    );
  }
  if (grade.status === "meeting") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-meeting/15 px-2.5 py-1 text-xs font-medium text-meeting">
        <CheckCircle2 className="h-3 w-3" />
        Meeting
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ungraded/10 px-2.5 py-1 text-xs font-medium text-ungraded-foreground">
      <CircleDashed className="h-3 w-3" />
      Not Assessed
    </span>
  );
}

function TrendArrow({ direction }: { direction: TrendDirection }) {
  if (direction === "up") {
    return <TrendingUp className="h-3.5 w-3.5 text-meeting" />;
  }
  if (direction === "down") {
    return <TrendingDown className="h-3.5 w-3.5 text-attention" />;
  }
  return null;
}

export function GradesTable({
  grades,
  history,
  instructors,
  attentionClassNames,
  expandedClass,
  onClassClick,
  children,
}: GradesTableProps) {
  if (grades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground">No grade data yet. Tap Refresh to check.</p>
      </div>
    );
  }

  const sorted = sortClassesByUrgency(grades, attentionClassNames);

  return (
    <div className="space-y-3">
      <div className="flex justify-end px-1">
        <p className="text-xs text-muted-foreground">{`${grades.length} total`}</p>
      </div>

      <div className="space-y-1.5">
        {sorted.map((grade) => {
          const classHistory = history[grade.className] ?? [];
          const trend = computeTrend(classHistory);
          const isExpanded = expandedClass === grade.className;
          const instructor = grade.classId ? instructors.get(grade.classId) : undefined;
          const totalTargets =
            (grade.targetsMeeting ?? 0) +
            (grade.targetsNotMeeting ?? 0) +
            (grade.targetsNotAssessed ?? 0);

          return (
            <div key={grade.id}>
              <button
                type="button"
                className={`flex w-full items-center gap-3 rounded-lg border-l-[3px] bg-card px-4 py-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:bg-accent/50 ${getClassTabColor(grade.className)}`}
                onClick={() => onClassClick(grade.className)}
              >
                <ChevronRight
                  className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{grade.className}</span>
                  {instructor && (
                    <span className="block text-[11px] text-muted-foreground">{instructor}</span>
                  )}
                </div>
                {totalTargets > 0 && (
                  <ProgressBar
                    meeting={grade.targetsMeeting ?? 0}
                    notMeeting={grade.targetsNotMeeting ?? 0}
                    total={totalTargets}
                  />
                )}
                <StatusDots history={classHistory} />
                <TrendArrow direction={trend} />
                <StatusIndicator
                  grade={grade}
                  isAttention={attentionClassNames.has(grade.className)}
                />
              </button>

              {/* Accordion panel — T34 drilldown */}
              <div
                className="grid transition-[grid-template-rows] duration-200 ease-out"
                style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
              >
                <div className="overflow-hidden">
                  {isExpanded && (
                    <div className="ml-3 rounded-b-lg border-t border-border/50 bg-secondary/40">
                      {children?.(grade.className)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
