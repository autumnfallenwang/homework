// Schedule slot math — pure. Computes the N fire times across a day from
// runsPerDay + firstSlotAt, and converts a slot to a cron expression. Ported
// from the desktop app's src/lib/schedule/{fetch,notify}-schedule.ts (identical
// formula for both cadences). Lives in shared so it's unit-tested without
// node-cron; the API's scheduler turns these slots into cron jobs.

export const RUNS_PER_DAY_MIN = 1;
export const RUNS_PER_DAY_MAX = 8;

/** Parse "HH:MM" to minutes-of-day, tolerating junk (→ 0) and wrapping. */
export function firstSlotToMinutes(firstSlotAt: string): number {
  const parts = firstSlotAt.split(":");
  const h = Number.parseInt(parts[0] ?? "", 10);
  const m = Number.parseInt(parts[1] ?? "", 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return ((((h % 24) + 24) % 24) * 60 + (((m % 60) + 60) % 60)) % 1440;
}

/**
 * Spread `runsPerDay` fire times evenly across the day, starting at
 * `firstSlotAt`. Returns minutes-of-day in declaration order (NOT sorted).
 * Example: computeSlots(3, "09:00") → [540, 1020, 60] (09:00, 17:00, 01:00).
 */
export function computeSlots(runsPerDay: number, firstSlotAt: string): number[] {
  const n = Math.max(RUNS_PER_DAY_MIN, Math.min(RUNS_PER_DAY_MAX, Math.floor(runsPerDay)));
  const anchor = firstSlotToMinutes(firstSlotAt);
  const step = 1440 / n;
  return Array.from({ length: n }, (_, i) => (anchor + Math.round(step * i)) % 1440);
}

/**
 * Convert a slot (minutes-of-day) to a 5-field cron expression. weekdaysOnly
 * restricts to Mon–Fri (cron day-of-week 1-5).
 */
export function slotToCron(minute: number, weekdaysOnly: boolean): string {
  const hh = Math.floor(minute / 60);
  const mm = minute % 60;
  return `${mm} ${hh} * * ${weekdaysOnly ? "1-5" : "*"}`;
}
