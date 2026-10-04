# 0008 — Solutions live on the homework item; free edits until 7 AM, then a change history

- **Status:** accepted
- **Date:** 2026-10-04
- **Deciders:** project founder

## Context

Stage 2 ([ADR 0006](./0006-child-entered-homework.md), [0007](./0007-given-on-date-replaces-day-marks.md))
gives the child a list of homework items with a done tick. Stage 4 had pencilled in a separate
Solutions tab where the child would upload finished work for a parent to approve or send back.
After trying the pages, the founder set the direction (2026-10-03/04, design page
https://claude.ai/artifact/PpZPyotJqjkw8Gpckn5cCj):

- The parent is not a teacher. They look; they do not approve, reject or comment. Parent actions
  may come later, not now.
- The solution belongs on the same page as the homework, not on another tab.
- A child must be able to fix mistakes freely, but once the homework evening is over the parent
  must be able to trust what they see: no quiet deletes, no quiet changes.
- An approval workflow with states, attempts and locks (an earlier proposal) was rejected as too
  formal for a family app.

## Decision

**1. One page, two sections, two Save buttons.** The child's item page has the homework (class,
type, what to do, details, given on, due, photos of the sheet) with **Save homework**, and below it
the **solution** (up to 8 photos of the finished work and/or a note) with **Save solution**. Each
button saves only its own section. On a new item the solution section opens once the homework is
saved. The Solutions tab and the done tick are removed.

**2. Done is derived.** An item with a solution (a solution note or at least one solution photo)
counts as done in lists, Today and the digest; "overdue" means past due with no solution.

**3. The first day is free.** From adding an item until the next **7:00 AM** (server `TZ`) the child
can add, change or delete anything, and nothing is recorded.

**4. After that, changes are recorded and the item stays.** The child can change everything except
**Given on**. Every change is recorded in `homework_item_events`: who, when, the section, and old →
new per field, plus photos added or removed. A photo removed after the first day is only hidden
from the child; the parent can still open it from the history. The item cannot be deleted.

**5. The parent only views.** The parent's item page shows the homework, the solution, when the item
was added (server time, never editable), an "Edited" label and the history. No buttons.

Considered and rejected:
- *Midnight cutoff*: an item added at 11:30 PM would get 30 minutes.
- *24 hours after adding*: the child could delete quietly during the next school day, after the
  8:00 digest.
- *Parent approve / send back, attempts, frozen states*: more than a parent who only looks needs.

## Consequences

**Positive:** one place for everything about an item; mistakes are cheap on the first evening;
after 7 AM what the parent sees can't be erased, only changed in the open; the history built now is
what any later parent action would build on.

**Negative / risks:**
- A duplicate noticed after the first day stays for good. The first parent action worth adding is a
  Delete for the parent.
- Items that were ticked done before this change get the solution note "Marked done" so they keep
  counting as done; their done time becomes the solution time.
- Removed photos keep their bytes, and solution photos add roughly as much again as the sheet
  photos. Still **no backups** (ADR 0006); the child's finished work is the first data in the app
  that can't be fetched again.
- The 7 AM cutoff uses the server's time zone, like the date rules in ADR 0007.

## Notes

- Supersedes ADR 0006's done tick (`status`, `completed_at`) and the stage 4 Solutions tab plan.
- Milestone: [11 — Solutions and change history](../milestones/11-solutions-and-history.md).
