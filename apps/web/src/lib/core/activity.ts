// Pure recent-activity diff — no platform imports. Ported verbatim from the
// desktop app; record types now come from @homework/shared.

import type { AssignmentRecord, GradeRecord } from "@homework/shared";

export type ActivityType = "improved" | "declined" | "newScores";

export interface ActivityItem {
  type: ActivityType;
  className: string;
  scoreFrom?: number;
  scoreTo?: number;
  count?: number;
}

const SCORE_CHANGE_THRESHOLD = 0.1;

function parseGrade(grade: string | null): number | null {
  if (!grade) return null;
  const n = Number.parseFloat(grade);
  return Number.isNaN(n) ? null : n;
}

function assignmentKey(asn: AssignmentRecord): string {
  return asn.teAssignmentId != null && asn.teAssignmentId > 0
    ? `id:${asn.teAssignmentId}`
    : `name:${asn.className}::${asn.assignmentName}`;
}

function typeRank(t: ActivityType): number {
  switch (t) {
    case "improved":
      return 0;
    case "newScores":
      return 1;
    case "declined":
      return 2;
  }
}

/**
 * Diff the current scrape against a previous one and derive a list of
 * noteworthy changes for the "Since last check" dashboard section. Empty when
 * there's no previous scrape or nothing changed beyond thresholds.
 */
export function computeRecentActivity(
  currGrades: GradeRecord[],
  currAssignments: AssignmentRecord[],
  prevGrades: GradeRecord[] | null,
  prevAssignments: AssignmentRecord[] | null,
): ActivityItem[] {
  if (!prevGrades || !prevAssignments) return [];

  const items: ActivityItem[] = [];

  const prevGradeByName = new Map<string, GradeRecord>();
  for (const g of prevGrades) prevGradeByName.set(g.className, g);

  for (const curr of currGrades) {
    const prev = prevGradeByName.get(curr.className);
    if (!prev) continue;
    const currNum = parseGrade(curr.currentGrade);
    const prevNum = parseGrade(prev.currentGrade);
    if (currNum == null || prevNum == null) continue;
    const diff = currNum - prevNum;
    if (Math.abs(diff) < SCORE_CHANGE_THRESHOLD) continue;
    items.push({
      type: diff > 0 ? "improved" : "declined",
      className: curr.className,
      scoreFrom: prevNum,
      scoreTo: currNum,
    });
  }

  const prevAsnKeys = new Set(prevAssignments.map(assignmentKey));
  const newScoreCounts = new Map<string, number>();
  for (const curr of currAssignments) {
    const key = assignmentKey(curr);
    if (prevAsnKeys.has(key)) continue;
    if (curr.isMissing) continue;
    if (curr.scoreNumeric == null || curr.scoreNumeric <= 0) continue;
    newScoreCounts.set(curr.className, (newScoreCounts.get(curr.className) ?? 0) + 1);
  }
  for (const [className, count] of newScoreCounts) {
    items.push({ type: "newScores", className, count });
  }

  items.sort((a, b) => {
    const r = typeRank(a.type) - typeRank(b.type);
    if (r !== 0) return r;
    return a.className.localeCompare(b.className);
  });

  return items;
}
