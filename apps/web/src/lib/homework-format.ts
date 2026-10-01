// Small display helpers for child-entered homework (ADR 0006). Dates are plain
// local days (YYYY-MM-DD), read as UTC so no timezone can shift them.

import { addDaysIso, weekdayOfIso } from "@homework/shared";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Thu 10/1". */
export function formatShortDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${WEEKDAYS[weekdayOfIso(iso)]} ${m}/${d}`;
}

/** "Today", "Tomorrow", else "Thu 10/1". */
export function dueLabel(dueOn: string, today: string): string {
  if (dueOn === today) return "Today";
  if (dueOn === addDaysIso(today, 1)) return "Tomorrow";
  return formatShortDay(dueOn);
}

/** "Wed 9/30, 4:05 PM" — when an item was added, in the viewer's clock. */
export function formatAddedAt(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  const day = WEEKDAYS[d.getDay()];
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} ${d.getMonth() + 1}/${d.getDate()}, ${time}`;
}
