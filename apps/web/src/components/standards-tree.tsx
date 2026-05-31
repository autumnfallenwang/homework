"use client";

import {
  type Assignment,
  type AssignmentAttention,
  type AttentionConfig,
  type ClassDetails,
  computeClassAttention,
  DEFAULT_ATTENTION_CONFIG,
  type StandardAttentionNode as EngineStandardNode,
  type Standard,
} from "@homework/shared";
import type { LucideIcon } from "lucide-react";
import {
  BookX,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Clock,
  Info,
  TrendingDown,
} from "lucide-react";
import { useMemo } from "react";

interface StandardsTreeProps {
  detail: ClassDetails | null;
  isLoading?: boolean;
  attentionCfg?: AttentionConfig;
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

// Resolve the leftmost row icon per D-04's uniform icon system. Every state
// gets exactly one icon — parents can scan a column of rows instead of
// decoding mixed visual treatments. Mirrors Settings → Attention's legend.
function resolveAssignmentIcon(
  assignment: Assignment,
  attention: AssignmentAttention,
): { icon: LucideIcon; className: string } {
  if (assignment.isMissing) {
    return {
      icon: BookX,
      className: attention.withinWindow ? "text-attention" : "text-muted-foreground",
    };
  }
  if (attention.reason === "lowScore") {
    return {
      icon: TrendingDown,
      className: attention.withinWindow ? "text-attention/70" : "text-muted-foreground",
    };
  }
  const hasGrade = assignment.gradeLetter !== "" || assignment.grade !== "";
  if (hasGrade) {
    return { icon: CheckCircle2, className: "text-meeting" };
  }
  return { icon: CircleDashed, className: "text-muted-foreground" };
}

function AssignmentRow({
  assignment,
  attention,
}: {
  assignment: Assignment;
  attention: AssignmentAttention;
}) {
  const { icon: Icon, className: iconClass } = resolveAssignmentIcon(assignment, attention);

  // One uniform row container for every state. The icon (resolved above) +
  // right-cluster content carry all the semantic weight — no per-state
  // border/background boxes. Missing rows put "Missing" in the right cluster;
  // others put the grade / "Not graded" tag.
  if (assignment.isMissing) {
    const isAgedOut = !attention.withinWindow;
    const nameClasses = `truncate text-[12px] font-medium ${
      isAgedOut ? "text-muted-foreground" : ""
    }`;
    const tagClasses = isAgedOut
      ? "text-[11px] font-medium text-muted-foreground"
      : "text-[11px] font-medium text-attention";

    return (
      <div className="flex items-center justify-between rounded-md px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon className={`h-3 w-3 shrink-0 ${iconClass}`} />
          <span className={nameClasses}>{assignment.name}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {assignment.dueDate && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatPortalDate(assignment.dueDate)}
            </span>
          )}
          <span className={tagClasses}>Missing</span>
        </div>
      </div>
    );
  }

  const hasGrade = assignment.gradeLetter !== "" || assignment.grade !== "";

  return (
    <div className="flex items-center justify-between rounded-md px-3 py-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <Icon className={`h-3 w-3 shrink-0 ${iconClass}`} />
        <span className="truncate text-[12px] text-foreground/80">{assignment.name}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {assignment.dueDate && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatPortalDate(assignment.dueDate)}
          </span>
        )}
        {hasGrade ? (
          <>
            {assignment.gradeLetter && (
              <span className="min-w-[2rem] text-right text-[12px] font-medium tabular-nums">
                {assignment.gradeLetter}
              </span>
            )}
            {assignment.grade && (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {assignment.grade}
              </span>
            )}
          </>
        ) : (
          <span className="text-[11px] italic text-muted-foreground">Not graded</span>
        )}
      </div>
    </div>
  );
}

function StandardNode({
  standard,
  attention,
  depth,
}: {
  standard: Standard;
  attention: EngineStandardNode;
  depth: number;
}) {
  const hasContent = standard.assignments.length > 0 || standard.children.length > 0;
  const { status, agedOutOnly } = attention.flag;

  // Three-state icon — TeacherEase's M/P/B/PS letter (shown below) carries the
  // meeting dimension.  This icon carries OUR attention dimension (per Q25).
  let Icon = CheckCircle2;
  let iconClass = "text-meeting";
  let iconTitle = "All clear";
  if (status === "attention") {
    Icon = CircleAlert;
    iconClass = "text-attention";
    iconTitle = "Needs attention";
  } else if (agedOutOnly) {
    iconClass = "text-muted-foreground";
    iconTitle = "Older items (resolved)";
  }

  return (
    <div className={depth > 0 ? "ml-4" : ""}>
      <div className="flex items-center gap-2 py-1.5">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${iconClass}`} aria-label={iconTitle} role="img">
          <title>{iconTitle}</title>
        </Icon>
        <span className="text-[13px] font-medium" style={{ fontFamily: "var(--font-heading)" }}>
          {standard.name}
        </span>
        {standard.scoreLetter && (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {standard.scoreLetter}
          </span>
        )}
      </div>

      {standard.assignments.length > 0 && (
        <div className="ml-5 space-y-0.5">
          {standard.assignments.map((asn, i) => {
            const asnAttention = attention.assignments[i];
            if (!asnAttention) return null;
            return (
              <AssignmentRow
                key={`${asn.name}-${asn.dueDate}`}
                assignment={asn}
                attention={asnAttention}
              />
            );
          })}
        </div>
      )}

      {standard.children.length > 0 && (
        <div className="ml-1">
          {standard.children.map((child, i) => {
            const childAttention = attention.children[i];
            if (!childAttention) return null;
            return (
              <StandardNode
                key={child.name}
                standard={child}
                attention={childAttention}
                depth={depth + 1}
              />
            );
          })}
        </div>
      )}

      {!hasContent && (
        <p className="ml-5 py-1 text-[11px] italic text-muted-foreground">(no assignments yet)</p>
      )}
    </div>
  );
}

export function StandardsTree({
  detail,
  isLoading,
  attentionCfg = DEFAULT_ATTENTION_CONFIG,
}: StandardsTreeProps) {
  // Compute attention unconditionally — hook rules require it above any
  // early-returns.  `null` when detail isn't ready yet.
  const attention = useMemo(
    () => (detail ? computeClassAttention(detail, new Date(), attentionCfg) : null),
    [detail, attentionCfg],
  );

  if (isLoading) {
    return (
      <div className="px-4 py-4">
        <p className="text-[12px] text-muted-foreground">Loading details...</p>
      </div>
    );
  }

  if (!detail || !attention) {
    return (
      <div className="flex items-center gap-2 px-4 py-4">
        <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-[12px] text-muted-foreground">No standards data available.</p>
      </div>
    );
  }

  if (detail.standards.length === 0) {
    return (
      <div className="px-4 py-4">
        <p className="text-[12px] text-muted-foreground">No standards data available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 px-4 py-3">
      {detail.standards.map((standard, i) => {
        const node = attention.standards[i];
        if (!node) return null;
        return <StandardNode key={standard.name} standard={standard} attention={node} depth={0} />;
      })}
    </div>
  );
}
