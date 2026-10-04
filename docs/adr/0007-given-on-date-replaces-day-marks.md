# 0007 — The child picks the "given on" day; "that's everything for today" goes

- **Status:** accepted
- **Date:** 2026-10-03
- **Deciders:** project founder

## Context

[ADR 0006](./0006-child-entered-homework.md) set `homework_items.assigned_on` on the server (the
day the item was entered, never edited) and added a per-day mark, "That's everything for today"
(`homework_days`), shown on the child's list, the parent's Review and Today views and the digest.
After trying the pages the founder found both wrong for real use (2026-10-03):

- A child often enters homework the day after it was given. With the entry day as "given on",
  yesterday's homework showed up as today's on the parent's Today view and in the digest.
- The day mark was an extra chore with no clear meaning ("keep it simple"); the given-on day
  already answers "what was given today".

## Decision

**1. "Given on" is a field the child fills in.** The Add / Edit form has a required **Given on**
date next to **Due**, starting at today. `assigned_on` stores it; create requires it and edit may
change it. Today, the hero counts and the digest's "Homework for today" go by it.

**2. Date rules, enforced at every layer.** An item is given **on or before** its due day, and
never after today:
- the form checks on Save, like a missing field (red outline, a line under the field, a jump to the
  first problem). The date pickers' `min`/`max` are only a hint.
- the API refuses with 400 and `code: "given_after_today"` or `"due_before_given"`. On edit it checks
  the stored day that the edit leaves alone (shared `homeworkDateProblem`).
- the database has `CHECK (assigned_on <= due_on)` (`homework_items_given_by_due`). "Not after
  today" depends on the clock, so a CHECK can't hold it; the API does.

**3. The day mark is removed.** `homework_days` is dropped (migration 0004), along with
`PUT|DELETE /api/child/homework-day`, the list's "Today · … · That's everything for today" strip,
the parent's "marked today complete" lines and the digest line. The list response's `today` is the
server's local day as a plain date.

**4. Required fields** on the form are marked with a red `*`: Class, Type, What to do, Given on,
Due. Details and Photos stay "(optional)". Save is never greyed out. A greyed-out button doesn't
say what's missing, a missing field may be off-screen on a phone, and a disabled button can't be
reached by keyboard or screen reader.

## Consequences

**Positive:** late entries land on the right day for the parent and the digest; one less concept
for the child; the rule that given comes before due holds for every row whatever writes it.

**Negative / risks:**
- The day marks recorded so far are deleted with the table (they had no other use).
- Migration 0004 pulls `assigned_on` back to `due_on` for any existing item entered after its due
  day, so the CHECK can be added. Those rows had the entry day there, not a real given-on day.
- "Not after today" uses the server's time zone (`TZ`); a browser in another zone near midnight can
  be refused. The form shows the server's refusal under the date field.

## Notes

- Supersedes ADR 0006's "`assigned_on` set by the server", its `homework_days` table, and its
  "Given on is not editable" risk. Everything else in ADR 0006 stands.
- Milestone: [10 — Child homework entry](../milestones/10-child-homework-entry.md) (review round 4).
