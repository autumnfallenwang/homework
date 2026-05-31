// Pure sort utilities — no platform imports. Ported verbatim from the desktop
// app; the GradeRecord type now comes from @homework/shared (uuid string ids).

import type { GradeRecord } from "@homework/shared";

const STATUS_PRIORITY: Record<string, number> = {
  needs_attention: 0,
  meeting: 1,
  not_assessed: 2,
};

/**
 * Sort grades by urgency. The app's attention engine is the primary sort key:
 * classes our engine flags go first regardless of TeacherEase's own status.
 * The secondary key is TeacherEase's `status`. Stable sort.
 */
export function sortClassesByUrgency(
  grades: GradeRecord[],
  attentionClassNames: ReadonlySet<string> = new Set(),
): GradeRecord[] {
  return [...grades].sort((a, b) => {
    const aAttn = attentionClassNames.has(a.className) ? 0 : 1;
    const bAttn = attentionClassNames.has(b.className) ? 0 : 1;
    if (aAttn !== bAttn) return aAttn - bAttn;
    const pa = STATUS_PRIORITY[a.status ?? "not_assessed"] ?? 2;
    const pb = STATUS_PRIORITY[b.status ?? "not_assessed"] ?? 2;
    return pa - pb;
  });
}
