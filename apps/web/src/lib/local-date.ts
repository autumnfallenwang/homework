// Local-timezone date helpers for the web UI. The desktop app kept `toLocalIso`
// in notify/digest.ts; the web only needs the pure helper, so it lives here.
// Per the project decision, the DB stores dates in UTC and the UI works in the
// viewer's local timezone — `toLocalIso` is how "today" is computed client-side.

/** Local-timezone ISO date (YYYY-MM-DD). Never toISOString() — that's UTC. */
export function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setDate(out.getDate() + n);
  return out;
}
