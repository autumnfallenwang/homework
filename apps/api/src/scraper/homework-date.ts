// Homework date utilities. Pure module — no platform imports. All date math
// uses UTC internally so the same input produces the same output regardless of
// locale. Storage is `YYYY-MM-DD`. Ported verbatim from the desktop app.

const MD_REGEX = /(\d{1,2})\s*\/\s*(\d{1,2})/;
const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const HW_DATE_REGEX = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseIsoDate(iso: string): { year: number; month: number; day: number } | null {
  const m = iso.match(ISO_DATE_REGEX);
  if (!m) return null;
  const year = Number.parseInt(m[1] ?? "", 10);
  const month = Number.parseInt(m[2] ?? "", 10);
  const day = Number.parseInt(m[3] ?? "", 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month, day };
}

/** Normalize a homework-page date (`M/D/YY`) to ISO `YYYY-MM-DD`. */
export function hwDateToIso(raw: string): string | null {
  if (!raw) return null;
  const match = raw.trim().match(HW_DATE_REGEX);
  if (!match) return null;
  const m = Number.parseInt(match[1] ?? "", 10);
  const d = Number.parseInt(match[2] ?? "", 10);
  const yy = Number.parseInt(match[3] ?? "", 10);
  if (!Number.isFinite(m) || !Number.isFinite(d) || !Number.isFinite(yy)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${2000 + yy}-${pad2(m)}-${pad2(d)}`;
}

/**
 * Convert a due-date string (e.g. `"Friday 4/17"`) to ISO. Year anchors on
 * `hwDateIso`: if the due M/D is strictly earlier than the hw M/D, rolls forward
 * one year. Returns null on unparseable input.
 */
export function dueDateToIso(raw: string | null, hwDateIso: string): string | null {
  if (!raw) return null;
  const mdMatch = raw.match(MD_REGEX);
  if (!mdMatch) return null;
  const dueM = Number.parseInt(mdMatch[1] ?? "", 10);
  const dueD = Number.parseInt(mdMatch[2] ?? "", 10);
  if (!Number.isFinite(dueM) || !Number.isFinite(dueD)) return null;
  if (dueM < 1 || dueM > 12 || dueD < 1 || dueD > 31) return null;

  const anchor = parseIsoDate(hwDateIso);
  if (!anchor) return null;

  const dueKey = dueM * 100 + dueD;
  const hwKey = anchor.month * 100 + anchor.day;
  const year = dueKey < hwKey ? anchor.year + 1 : anchor.year;

  return `${year}-${pad2(dueM)}-${pad2(dueD)}`;
}

/**
 * Fallback inference when the teacher didn't post a due date: the next school
 * day after `hwDateIso` (hw + 1 day, snapping Sat/Sun to Monday). Returns null
 * on malformed `hwDateIso`.
 */
export function inferDueDateIso(hwDateIso: string): string | null {
  const anchor = parseIsoDate(hwDateIso);
  if (!anchor) return null;

  const date = new Date(Date.UTC(anchor.year, anchor.month - 1, anchor.day + 1));
  const dow = date.getUTCDay();
  if (dow === 6) date.setUTCDate(date.getUTCDate() + 2);
  else if (dow === 0) date.setUTCDate(date.getUTCDate() + 1);

  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export interface ResolvedDueDate {
  readonly iso: string | null;
  readonly inferred: boolean;
}

/** Three-tier resolution used by persistHomework. */
export function resolveDueDate(raw: string | null, hwDateIso: string): ResolvedDueDate {
  const parsed = dueDateToIso(raw, hwDateIso);
  if (parsed) return { iso: parsed, inferred: false };
  const inferred = inferDueDateIso(hwDateIso);
  if (inferred) return { iso: inferred, inferred: true };
  return { iso: null, inferred: false };
}
