// Homework date utilities. Pure module — no platform imports. Ported verbatim
// from the desktop app (src/lib/core/homework-date.ts). Lives in shared so the
// API parser and the web both use one implementation.
//
// All date math uses UTC internally so the same input produces the same output
// regardless of the user's locale. Storage is `YYYY-MM-DD` calendar dates (no
// timezone); display-side code parses these with `new Date(iso + "T00:00:00Z")`
// and formats with `timeZone: "UTC"`.

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

/**
 * Normalize a homework-page date (`M/D/YY`) to ISO `YYYY-MM-DD`.
 * Returns null on unparseable input. Year is `2000 + YY`.
 */
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
 * Convert a due-date string (e.g. `"Friday 4/17"`, `"Tuesday  1/5"`) to
 * ISO `YYYY-MM-DD`. Year anchors on `hwDateIso`: if the due M/D is strictly
 * earlier than the hw M/D, rolls forward by one year (Dec → Jan wraparound).
 *
 * Does NOT validate that the weekday name matches the computed date — we
 * trust the numeric part (teacher typos on the weekday are common and
 * harmless here).
 *
 * Returns null on:
 * - null/empty `raw`
 * - `raw` with no M/D pattern (e.g. `"TBD"`, `"Apr 17"`)
 * - out-of-range month or day
 * - malformed `hwDateIso`
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
 * Fallback inference when the teacher didn't post a due date: pick the
 * next school day after `hwDateIso`. "Next school day" means `hw + 1 day`,
 * snapping Saturday/Sunday forward to the following Monday.
 *
 * Does NOT know about holidays — callers should treat results as an
 * estimate and surface that to the user (see `dueDateInferred` flag).
 *
 * Returns null on malformed `hwDateIso`.
 */
export function inferDueDateIso(hwDateIso: string): string | null {
  const anchor = parseIsoDate(hwDateIso);
  if (!anchor) return null;

  // UTC construction + getters/setters — avoids local DST / offset surprises.
  const date = new Date(Date.UTC(anchor.year, anchor.month - 1, anchor.day + 1));
  const dow = date.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  if (dow === 6)
    date.setUTCDate(date.getUTCDate() + 2); // Sat → Mon
  else if (dow === 0) date.setUTCDate(date.getUTCDate() + 1); // Sun → Mon

  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export interface ResolvedDueDate {
  readonly iso: string | null;
  readonly inferred: boolean;
}

/**
 * Three-tier resolution used by `persistHomework`:
 * 1. Parse the raw string against the hw-date anchor.
 * 2. Fall back to `inferDueDateIso(hwDateIso)` when parsing fails.
 * 3. Return `{ iso: null, inferred: false }` if even the anchor is malformed.
 */
export function resolveDueDate(raw: string | null, hwDateIso: string): ResolvedDueDate {
  const parsed = dueDateToIso(raw, hwDateIso);
  if (parsed) return { iso: parsed, inferred: false };
  const inferred = inferDueDateIso(hwDateIso);
  if (inferred) return { iso: inferred, inferred: true };
  return { iso: null, inferred: false };
}
