"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import type { ChildStatus } from "@/lib/hero-statuses";

export type { ChildStatus };

interface StatusHeroProps {
  statuses: ChildStatus[];
  onChildSelect?: (childId: string) => void;
}

function ChildRow({
  status,
  showName,
  onSelect,
}: {
  status: ChildStatus;
  showName: boolean;
  onSelect?: () => void;
}) {
  const isOk = status.attentionCount === 0;
  const attentionBody = isOk
    ? "All caught up"
    : status.attentionCount === 1
      ? `${status.attentionCount} class needs attention`
      : `${status.attentionCount} classes need attention`;

  return (
    <div className={`rounded-lg px-4 py-3 ${isOk ? "bg-meeting/6" : "bg-attention/6"}`}>
      <button type="button" className="flex w-full items-start gap-3 text-left" onClick={onSelect}>
        {isOk ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-meeting" />
        ) : (
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-attention" />
        )}
        <div className="min-w-0 flex-1">
          <p
            className={`text-[18px] font-medium leading-tight ${isOk ? "text-meeting" : "text-foreground"}`}
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {showName ? `${status.name}: ` : ""}
            {attentionBody}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {`${status.meetingCount} meeting standards`}
          </p>
          {status.homeworkConfigured && (
            <>
              <p className="text-[12px] text-muted-foreground">
                {`${status.homeworkForTodayCount} homework for today`}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {`${status.homeworkDueTodayCount} homework due today`}
              </p>
            </>
          )}
        </div>
      </button>
    </div>
  );
}

export function StatusHero({ statuses, onChildSelect }: StatusHeroProps) {
  if (statuses.length === 0) return null;

  const multiChild = statuses.length > 1;

  return (
    <div className="space-y-px overflow-hidden rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      {statuses.map((s) => (
        <ChildRow
          key={s.childId}
          status={s}
          showName={multiChild}
          onSelect={onChildSelect ? () => onChildSelect(s.childId) : undefined}
        />
      ))}
    </div>
  );
}
