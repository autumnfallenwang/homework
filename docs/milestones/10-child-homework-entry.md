---
name: 10-child-homework-entry
status: in-progress
created: 2026-09-30
---

# Milestone 10 — Child homework entry (stage 2)

Stage 2 of the child-homework plan ([ADR 0006](../adr/0006-child-entered-homework.md)): the child
enters their own homework, with photos, and the parent sees it on Today, in the email digest and
on the Review tab. Each child moves over with one switch on their card.

## Goal

On Ivy's card the parent turns on **Child enters homework** and sets her classes. Ivy signs in,
adds "Worksheet 2.3" for Math due Friday with a photo of the sheet, ticks yesterday's item done
and marks the day complete. The parent's Today view shows her items and "Ivy marked today
complete"; the Review tab lists everything she entered, read only, with the photo.

## Scope / deliverables

`packages/shared`:
- `ChildRecord.homeworkSource` (`page` | `child`); `patchChildSchema` takes it.
- Homework entry types and schemas: classes (`HomeworkClass`, class-list input), items
  (`HomeworkItem`, create / update input), the list response with today's completion,
  `ChildProfile.homeworkEntry`.

`apps/api`:
- Migration `0003`: `children.homework_source` (CHECK), `child_classes`, `homework_items`,
  `homework_photos` (bytea), `homework_days`.
- `services/homework-entry.ts`: class list (replace in one transaction, archive used classes,
  TeacherEase suggestions), items (create / update / delete, own child only), photos (sniffed
  type, size and count limits), day completion.
- Routes — child (`/api/child/*`, refused while the profile is on `page`):
  `GET|POST /homework`, `GET|PATCH|DELETE /homework/:id`, `POST /homework/:id/photos`,
  `GET|DELETE /homework/:id/photos/:photoId`, `GET /homework-classes`,
  `PUT|DELETE /homework-day`.
  Parent: `PATCH /api/children/:id { homeworkSource }`, `GET|PUT /api/children/:id/homework-classes`,
  `GET /api/children/:id/homework-classes/suggestions`, `GET /api/children/:id/homework-items`,
  `GET /api/homework-items/:id`, `GET /api/homework-items/:id/photos/:photoId`.
- The homework page fetch skips `child` profiles; the digest reads entered items for them (with
  the day-complete line).

`apps/web`:
- Child: `/child` becomes the homework list (Overdue / Due today / Due tomorrow / Later this week /
  Later, a Done fold, the day strip); `/child/homework/new` and `/child/homework/[id]` share one
  form (class and type chips, what to do, details, a date input, photos shrunk in the browser).
  With entry off the tab says so.
- Parent: the switch and an inline class editor on each child's card; Review lists the selected
  child's items read only, `/review/homework/[id]` shows one with its photos; Today shows entered
  items for a `child` profile.

## Exit criteria

- [x] lint, typecheck, fast tests and live-Postgres integration tests green; new tests cover:
  access (a child never reaches another child's items or any parent route; the parent cannot
  write items), entry off → child writes refused, class list replace/archive/restore, photo
  type/size/count limits, digest + fetch behaviour per source.
- [x] Migration 0003 applied to a copy of the production database (a `pg_dump` of prod in a
  throwaway container, removed after): 4 migrations, children / fetch runs / homework / logins /
  sessions unchanged, the profile defaults to `page`.
- [x] Browser end to end on the prod images (compose): switch on → classes (Other refused,
  reorder, Fill from TeacherEase with no data) → invite → child adds items with photos (a
  4032×3024 JPEG stored as 1600×1200 without EXIF, a PNG stored as JPEG, a fake HEIC refused with
  the message), Save and add another, edits, deletes, ticks done, marks the day → parent Today,
  hero counts, Review list and item detail with the photo; Fetch now skips the homework page while
  on and fetches it again when off; child sees "entry off" on the list and the Add page.
- [x] Released to the cluster (2fb48f7): 4 migrations applied by the hook; Ivy's profile on `page`
  until switched; 648 fetch runs / 757 homework / 2 logins / 3 sessions intact; every page 200;
  the new child and parent routes answer 401 without a session; no error lines after the rollout.
- [ ] *(you)* Turn on the switch for Ivy, set her classes, send her an invite link.

## Decisions

- ADR 0006 in full (source switch, parent-owned classes + Other, items, photos in Postgres,
  parent read only).
- **UI** (review rounds 1–3): class and type as the same single-choice chips; the due date is a
  plain date input starting at the next school day; no "given on" field; Add and Edit are one page.
- **No backups for now** (founder, 2026-09-30) — recorded as a risk in ADR 0006.
- **Review round 4** (founder, 2026-10-03, [ADR 0007](../adr/0007-given-on-date-replaces-day-marks.md)):
  the child picks a required "Given on" day (today by default), given ≤ due and ≤ today; no
  "that's everything for today"; required fields marked `*`; Save never greyed out.
- The list returns every to-do item and done items due in the last 30 days.

## Progress

- 2026-09-30: design settled (mockups, three rounds); ADR 0006 and this milestone written.
- 2026-09-30: built shared types, migration 0003, service + routes, digest/fetch/hero changes, the
  child list / Add / Edit pages, the card switch + class editor, Review list + item page, Today.
  Tests: 10 live-DB integration tests (switch, classes, isolation, edit/done/delete, photo limits,
  day, 30-day list window, parent read-only, suggestions, digest + fetch), access matrix extended,
  shared grouping/date/schema tests, photo sniff and display helpers. Verified end to end on the
  compose images (see exit criteria). Found on the way: Postgres `text` rejects a NUL temp name.
- 2026-10-03: review round 4 (ADR 0007): "Given on" field (required, default today, editable);
  given ≤ due on the form at Save, in the API (400 `due_before_given`) and as a DB CHECK; given ≤
  today on the form and in the API (400 `given_after_today`); day mark removed (migration 0004
  drops `homework_days` and pulls `assigned_on` back to `due_on` on rows entered after their due
  day; day routes, list strip, parent lines and digest line gone); required fields marked `*`, Save
  marks every problem under its field. Verified: lint, typecheck, fast tests, all API tests with
  live Postgres (136 passed, 1 skipped = live SMTP); prod images under compose in Playwright (empty
  Save, both date rules on Add and Edit, Save and add another keeps the dates, the API refusals with
  a child session, CHECK refuses raw SQL, parent Today/hero/Review/item page by given-on, digest
  via local Mailpit, 0 error log lines). Not run: 0004's fix-up UPDATE on a prod copy (prod dump
  not permitted from the agent).

## References

- Mockups: https://claude.ai/artifact/X6dEJBe7Ard6mLbAUyCMhb
- Stage plan (temp doc): https://claude.ai/code/artifact/186491e4-eaec-46e3-9817-d01f96988b20
- Depends on: M09 (logins and roles)
