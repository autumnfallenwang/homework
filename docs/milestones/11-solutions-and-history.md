---
name: 11-solutions-and-history
status: in-progress
created: 2026-10-04
---

# Milestone 11 — Solutions and change history

The child adds the solution on the same page as the homework, and after the first morning every
change she makes is recorded for the parent, who only views ([ADR 0008](../adr/0008-solutions-on-the-item-and-a-change-history.md),
design page https://claude.ai/artifact/PpZPyotJqjkw8Gpckn5cCj).

## Goal

Ivy adds "Worksheet 2.3" on Saturday evening, fixes a typo and deletes a duplicate with nothing
recorded. On Sunday she moves the due date and saves three photos of her finished work plus a note
with **Save solution**. The parent's Review list shows the item as done with "Edited"; its page
shows her solution and a history: the due move and the photos, including one she removed.

## Scope / deliverables

`packages/shared`:
- `HomeworkItem` without `status` / `completedAt`; with `solution` (note, photos, saved at),
  `hasSolution`, `firstDayEndsAt`, `edited`. Photo refs carry their kind.
- `saveHomeworkSolutionSchema`; `updateHomeworkItemSchema` without `status`.
- `HomeworkHistoryEntry`; grouping by `hasSolution`.

`apps/api`:
- Migrations: solution note and saved-at on items, kind and removed-at on photos,
  `homework_item_events`; then "done" items → solution note "Marked done", drop `status` /
  `completed_at`.
- Service: `firstDayEndsAt` (next 7:00 AM, server TZ); first day = no events, hard deletes;
  after = events for every change, Given on refused (`given_on_locked`), delete refused
  (`delete_locked`), photo removal hidden from the child only. Solution save; per-kind photo limits
  (sheet 4, solution 8).
- Routes: child `PUT /api/child/homework/:id/solution`, `POST …/photos?kind=sheet|solution`;
  parent `GET /api/homework-items/:id/history` (removed photos readable by the parent only).

`apps/web`:
- Child item page: homework section (Save homework, Save and add another on new, Delete on the
  first day only, Given on locked after) + solution section (photos + note, Save solution) +
  per-section "Unsaved changes" + a line saying changes are recorded after the first morning.
- Lists without the tick; done = has a solution; "Edited" on the parent's rows.
- Parent item page: solution, added time, Edited, history (removed photos viewable).
- Child Solutions tab removed.
- One photo viewer on both sides (ADR 0009): tiles on the page, a click opens a lightbox that rolls
  through the item's photos (sheet first); the child's tiles have ✕ and an Add tile.

## Exit criteria

- [x] lint, typecheck, fast tests and live-Postgres integration tests green; new tests cover the
  first-day vs after rules (events, Given on, delete, photo removal), solution save, done =
  has a solution, history access (parent only), the 7 AM cutoff (incl. after midnight and DST).
- [x] Migrations applied to the dev DB holding a ticked-done item: it keeps counting as done with
  the note "Marked done" (its done time as the solution time); a to-do item stays without one.
- [x] End to end on the dev servers in a browser: the goal story above, from both sides, with
  "after the first day" simulated by moving the item's `created_at` back.
- [ ] *(you)* Review, then commit and release.

## Decisions

- ADR 0008 in full. Parent actions, the child seeing the full history, reading photos and backups
  are parked.

## Progress

- 2026-10-04: design agreed (three rounds on the design page); ADR 0008 and this milestone written.
- 2026-10-04: built. Shared types (solution, hasSolution, firstDayEndsAt, edited, history entry,
  photo kind); migrations 0005 (solution columns, photo kind + removed_at, `homework_item_events`)
  and 0006 (done → "Marked done", drop status / completed_at) — two files so drizzle-kit never asks
  about a rename; service rules + `firstDayEndsAt`; routes (solution PUT, `?kind=`, parent history);
  web: item page = homework form + solution form (shared photo panel), lists without the tick,
  Edited label, parent item page with solution + history, Solutions tab removed. Tests: 140 API
  (2 new live-DB tests for solution and first-day rules, 7 AM cutoff incl. DST), 97 shared, 17 web.
  Dev e2e (Playwright, `pnpm dev` servers on homework_dev): Add page shows the solution section
  waiting; Save homework stays on the page with the item URL and "until Sun 7:00 AM" (added after
  midnight); same-day title fix + duplicate deleted with no events; solution note + 3 photos →
  Done; after moving `created_at` back: Given on disabled, no Delete, due move + note edit + a
  removed photo recorded; API refuses delete / Given on (409); parent Review shows Done + Edited,
  item page shows solution and 3 history lines, the removed photo still opens. Fixed on the way:
  the header said "Add homework" after the first save. Dev note: `apps/api/.env` predates M09 and
  lacks `BETTER_AUTH_SECRET` (copy the line from `.env.example`).
- 2026-10-04: photo viewer (founder's review, ADR 0009): `PhotoViewerProvider` + `PhotoGrid` with
  yet-another-react-lightbox (captions, counter, thumbnails, zoom) on the child's item page and the
  parent's; `PhotoPanel` now tiles + Add tile; history "view" opens the viewer. Dev e2e: Ivy's
  page — tiles with ✕ / Add, a solution tile opens at 2 / 3 with "Solution · photo 1 of 2", ←
  reaches the unsaved sheet photo "(not saved yet)", Esc closes; parent page — tiles without ✕,
  viewer 1 / 2 with arrows and strip, the removed photo opens alone; phone width checked.

## References

- Design page: https://claude.ai/artifact/PpZPyotJqjkw8Gpckn5cCj
- Depends on: M10 (child homework entry, incl. review round 4 / ADR 0007)
