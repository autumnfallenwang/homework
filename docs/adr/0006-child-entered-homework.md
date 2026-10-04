# 0006 — Child-entered homework: a per-child source switch, a parent-owned class list, photos in Postgres

- **Status:** accepted — amended by [0007](./0007-given-on-date-replaces-day-marks.md) (the child picks "given on"; no day mark) and [0008](./0008-solutions-on-the-item-and-a-change-history.md) (solution on the item, no done tick, change history)
- **Date:** 2026-09-30
- **Deciders:** project founder

## Context

The class homework page the scraper reads does not cover the child's class, so homework has to be
entered by the child (stage plan, stage 2; logins arrived in stage 1, [ADR 0004](./0004-accounts-and-roles.md)).
The design was settled over three review rounds of mockups (2026-09-30):

- The scraped `homework` table holds one text blob per subject per day (`"1) None2) Test
  Thursday."`), sometimes with a guessed due date. A child's list needs more: several items per
  class per day, a type, a short title plus details, a real due date, a done state, and who
  entered it.
- Some children may still be covered by a homework page; others enter their own. Mixing both in
  one Today view would double-count.
- The class names TeacherEase reports are long and duplicated ("Mathematics 8 Honors" twice, last
  year's grade 7 classes kept), so they make a poor picker on their own.
- Photos of the worksheet or the board are useful from day one, so they move from stage 3 into
  stage 2. Stage 3 becomes "read the photo and fill in the form".
- The deployment: one k3s node (the family desktop, 700+ GB free), the API as a single replica
  (`Recreate`, the scheduler is a singleton), Postgres as a StatefulSet on `local-path`, no object
  storage in the cluster, no backup jobs. The database is 23 MB today.

## Decision

**1. One homework source per child.** `children.homework_source` is `page` (default, today's
behaviour) or `child`. The parent flips it with a switch on the child's card ("Child enters
homework"). With `child`, the homework page is not fetched (its URL stays saved), and the parent's
Today view and the email digest read the child's items instead. A child can add or change items
only while their profile is on `child`.

**2. The parent owns each child's class list.** `child_classes` (name, position) per child, edited
on the child's card; it starts empty, with an optional "Fill from TeacherEase" that offers the
current class names. The child picks from that list plus a fixed **Other**, which is not a row
(`class_id` NULL). Removing a class that has items archives it: it leaves the picker and old items
keep its name; re-adding the name restores it.

**3. Homework items.** `homework_items`: class (nullable → Other), kind (`homework` | `test` |
`project` | `other`), title (≤ 120), details (≤ 2,000), `assigned_on` (the local day it was
entered, set by the server), `due_on`, status (`todo` | `done`, `completed_at`), `created_by`,
timestamps. `homework_days` records "That's everything for today" per child and day. The scraped
`homework` table is untouched.

**4. Photos in Postgres.** `homework_photos` (bytea, content type, size; up to 4 per item, ≤ 2 MB
each, JPEG/PNG/WebP checked from the bytes). The browser shrinks each photo to ≤ 1600 px and
re-saves it as JPEG before upload, which also drops the camera's location data. Photos are served
by the API with the same access rules as their item and cached as immutable.
Considered and rejected for now:
- *Files on a volume mounted into the API* (llm-gateway's pattern): two stores to keep in step,
  orphan cleanup, for no gain at this size.
- *Object storage in the cluster* (S3-compatible): the textbook answer for many servers, but a new
  stateful service to run for a couple of photos a day.

At ~0.3–0.5 GB a school year the database copes easily; the photo table is never read by lists.
If photos reach many GB or a second API replica appears, only the storage code behind the photo
URL changes.

**5. Access.** The child works under `/api/child/homework*` (their child id from the session,
never the URL). The parent reads under `/api/children/:id/homework-items` and
`/api/homework-items/:id` and manages the switch and the class list. **The parent's view is read
only in stage 2**; stage 4 adds approve / send back on the same item page.

## Consequences

**Positive:** stage 2 fixes the real problem (the child's class has no homework page) without
touching the scraped data; each child moves over independently; everything stays in one database
and one transaction (deleting an item deletes its photos); the web pages, URLs and access rules do
not change if photo storage moves later.

**Negative / risks:**
- **No backups yet** (founder's decision, 2026-09-30). Until now everything in the database could
  be fetched again; the child's entries and photos cannot. A disk failure on the node loses them.
- The database grows by roughly half a GB a year with photos; `pg_dump`s grow with it.
- iPhone HEIC photos cannot be shrunk by Chrome; the page asks for a JPEG instead.
- "Given on" is not editable: an item entered late counts as given on the day it was entered.

## Notes

- Mockups (review rounds 1–3): https://claude.ai/artifact/X6dEJBe7Ard6mLbAUyCMhb
- Milestone: [10 — Child homework entry](../milestones/10-child-homework-entry.md)
- Builds on [ADR 0004](./0004-accounts-and-roles.md) (path-based access) and
  [ADR 0005](./0005-email-sign-in-for-everyone.md).
