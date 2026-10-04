# 0011 — Submit marks homework done; Save is a draft

- **Status:** accepted
- **Date:** 2026-10-04
- **Deciders:** project founder

## Context

[ADR 0008](./0008-solutions-on-the-item-and-a-change-history.md) made an item done as soon as
it had a solution (any saved note or photo). Saving half-finished work therefore already showed
as done to the parent. The founder asked for an explicit step (2026-10-04).

## Decision

- **Save solution** stores the note and photos as a draft; it does not make the item done. The
  **note is required** (red `*`; the API refuses a blank one); photos stay optional.
- **Submit**, next to it (both buttons the same primary style as Save homework), marks the item
  done: `homework_items.submitted_at`. It submits what is saved: the button is only enabled once a
  solution is saved and the section has no unsaved changes; the API still refuses an item without
  a saved note with 400 `nothing_to_submit`.
- After a Submit the child can still change everything under the same first-day rules (ADR
  0008); editing keeps the item done. **Submit again** is allowed and moves `submitted_at`.
- **Every Submit is recorded** in `homework_item_events` (`section: solution`, `action:
  submitted`) — also on the first day, unlike edits. Only the latest content is kept; there are
  no per-submit versions. The parent's item page shows "Done · submitted <time>" and a
  "Submitted" line per Submit in its History.
- Lists, Today, the hero and the digest's "(done)" go by `submitted_at`; "overdue" = past due
  and not submitted.
- Migration 0007 counts items that already had a solution as submitted at their last solution
  save, so nothing done became open.

## Consequences

**Positive:** the parent sees "done" only when the child says so; a draft can be saved at any
time; resubmits are visible without storing versions.

**Negative:** an item edited after its Submit stays done without a new Submit; the History shows
the edits after the first day, but first-day edits after a Submit are not recorded.

## Notes

- Amends ADR 0008 ("done is derived from the solution"). Milestone:
  [11 — Solutions and change history](../milestones/11-solutions-and-history.md).
