// Thin web-side wrappers over the shared schedule primitives
// (`@homework/shared`'s computeSlots + RUNS_PER_DAY_MIN/MAX). The desktop app
// had separate fetch-/notify-schedule modules with parse helpers, slot
// formatting, and a weekday helper; the shared package only ships the pure
// slot math, so the rest lives here for the settings UI.

import { computeSlots, RUNS_PER_DAY_MAX, RUNS_PER_DAY_MIN } from "@homework/shared";

// Both cadences share the same min/max and the same formula; the desktop kept
// separate aliases per surface, mirrored here so the components read cleanly.
export const FETCH_RUNS_PER_DAY_MIN = RUNS_PER_DAY_MIN;
export const FETCH_RUNS_PER_DAY_MAX = RUNS_PER_DAY_MAX;
export const FETCH_RUNS_PER_DAY_DEFAULT = 3;
export const FETCH_FIRST_SLOT_DEFAULT = "07:00";

export const NOTIFY_RUNS_PER_DAY_MIN = RUNS_PER_DAY_MIN;
export const NOTIFY_RUNS_PER_DAY_MAX = RUNS_PER_DAY_MAX;
export const NOTIFY_RUNS_PER_DAY_DEFAULT = 1;
export const NOTIFY_FIRST_SLOT_DEFAULT = "16:00";
export const NOTIFY_FETCH_BEFORE_DEFAULT = true;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Clamp/round a runs-per-day value into [MIN, MAX]; junk → default. */
function parseRunsPerDay(raw: string, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(RUNS_PER_DAY_MIN, Math.min(RUNS_PER_DAY_MAX, Math.floor(n)));
}

/** Validate an "HH:MM" string; junk → fallback. */
function parseFirstSlot(raw: string, fallback: string): string {
  return HHMM.test(raw.trim()) ? raw.trim() : fallback;
}

export function parseFetchRunsPerDay(raw: string): number {
  return parseRunsPerDay(raw, FETCH_RUNS_PER_DAY_DEFAULT);
}

export function parseFetchFirstSlot(raw: string): string {
  return parseFirstSlot(raw, FETCH_FIRST_SLOT_DEFAULT);
}

export function parseNotifyRunsPerDay(raw: string): number {
  return parseRunsPerDay(raw, NOTIFY_RUNS_PER_DAY_DEFAULT);
}

export function parseNotifyFirstSlot(raw: string): string {
  return parseFirstSlot(raw, NOTIFY_FIRST_SLOT_DEFAULT);
}

export function computeFetchSlots(runsPerDay: number, firstSlotAt: string): number[] {
  return computeSlots(runsPerDay, firstSlotAt);
}

export function computeNotifySlots(runsPerDay: number, firstSlotAt: string): number[] {
  return computeSlots(runsPerDay, firstSlotAt);
}

/** Format minutes-of-day as a local "h:mm AM/PM" string. */
export function formatSlotMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** True for Saturday (6) and Sunday (0). */
export function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}
