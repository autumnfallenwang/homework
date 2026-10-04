---
name: child-homework-entry
description: ADR 0006/0007/0008 (M10, M11) — per-child homework_source switch, parent-owned class list, child items with a child-picked given-on day (≤ due, ≤ today), solution on the item (done = has a solution), free edits until the next 7 AM then recorded changes (homework_item_events), Given on locked + no delete after; photos as bytea (sheet/solution, soft-removed); where each rule lives + pitfalls.
metadata:
  type: feedback
---

**Source switch.** `children.homework_source` = `page` | `child` (CHECK). `child` ⇒
`HomeworkSource.isApplicable` is false (the page URL stays saved), Today / hero / digest read
`homework_items` (`services/homework-entry.ts#itemsForDay`, `digest.ts#enteredItemAsRecord`), and
child writes are allowed — every write calls `assertEntryOn` (403 `code: "entry_off"`); reads never do.

**Class list** is replaced as a whole (`PUT /api/children/:id/homework-classes`, ordered list):
an entry with `id` keeps that row (rename follows onto old items); without `id` it reuses a row of
the same lower-cased name (restoring an archived one) or inserts. Rows left out: deleted if unused,
archived if items use them, items MOVED onto the kept class when a kept class took their name.
Renames go through a temporary name first so swaps never hit the `lower(name)` unique index.
"Other" is not a row (`class_id` NULL) and is a reserved name (Zod).

**Items / dates.** `assigned_on` ("Given on") comes from the child: required on create, editable,
default today in the form. Rules (ADR 0007): given ≤ due (DB CHECK `homework_items_given_by_due`)
and given ≤ server today (API only — clock-dependent). One shared check, `homeworkDateProblem`
(`packages/shared`), feeds the form and `assertDates` in the service; refusals are 400 with
`code: given_after_today | due_before_given`. On PATCH the rule is checked against the stored day
the edit leaves alone. There is no day mark any more (`homework_days` dropped in 0004).

**Form.** Required = Class, Type, What to do, Given on, Due (red `*`, `RequiredMark`). Save is never
disabled: it marks every problem under its field (`FieldError`, `aria-invalid`), jumps to the first,
and re-checks live after the first try. A server date refusal lands under the same field.

**Solution + first day (ADR 0008, M11).** One item page, two forms: `HomeworkForm` (Save homework)
and `SolutionForm` (Save solution), each with its own "Unsaved changes"; photo handling is shared
(`photo-panel.tsx`: `usePhotoDraft` + `PhotoPanel`). No done tick: `hasSolution` = solution note or
an active `kind='solution'` photo — it only says there is something to submit. Done =
`submitted_at` set by `POST …/submit` (ADR 0011; needs a saved note — the note is required to
save a solution — `nothing_to_submit` otherwise;
every Submit recorded as a `submitted` event, even on the first day; editing after keeps it done). First day =
`firstDayEndsAt(createdAt)`: the next 07:00 in the server TZ (`setHours` on a local Date, DST-safe);
the item carries it as ISO so the web needn't know the TZ. Inside it: hard deletes, no events.
After it: `given_on_locked` / `delete_locked` (409), photo DELETE sets `removed_at` (child 404,
parent still served), every change → `homework_item_events` (field → [old, new]; class by name).
History is parent-only (`GET /api/homework-items/:id/history`); `edited` = any event exists.
Today, the hero and the digest show "Homework for today" (given today: `hwDate` / `assignedOn`)
and "Due <next hand-in day>" (`nextDueDay(today)` = next school day, `relativeDueDay` → "tomorrow"
/ "Mon 10/5"); class-page homework due that day comes from `?due=` (never filter the posted-today
list by due date — that was the old bug). Run the API integration tests against a separate DB
(`DATABASE_URL=…/homework_test`) when the dev DB holds review data: they wipe users/children.
Photos everywhere go through `photo-viewer.tsx` (ADR 0009): wrap the page in `PhotoViewerProvider`,
show tiles with `PhotoGrid section="sheet|solution"`; the provider keeps each grid's photos in a ref
so `open()` rolls through sheet then solution without re-rendering on every registration.
Tests simulate "after the first day" by moving `homework_items.created_at` back.

**Photos.** Raw request body (not multipart), `bodyLimit` 2 MB, type sniffed from bytes
(JPEG/PNG/WebP), ≤ 20 per section (`photosPerSection`, a hidden cap — no counter in the UI)
under a `FOR UPDATE` lock on the item; served with
`Cache-Control: private, max-age=31536000, immutable`. The web shrinks first
(`lib/photo-shrink.ts`: ≤ 1600 px, JPEG, EXIF dropped; HEIC → a "save it as JPEG" message).
`<img src>` to the API host works because web and API are same-site (cookie sent).

**Access.** Child: `/api/child/homework*` (child id from the session; another child's id → 404).
Parent: read-only `/api/children/:id/homework-items`, `/api/homework-items/:id[/photos/:pid]`.

**Pitfalls:**
- Postgres `text` rejects NUL bytes — never use `\u0000` as a temp marker (`~renaming~<id>` is used).
- Hono `c.body()` wants `Uint8Array<ArrayBuffer>`: copy a Buffer with `new Uint8Array(buf)`.
- Integration tests insert real `users` rows for child sessions: `homework_items.created_by` is an
  FK, so the fake `childOf()` session user (no row) cannot create items.
- A new `ChildRecord` field breaks every hand-written fixture (`runner.test.ts`,
  `digest.test.ts`) — add it there too (`as const` for the literal).
- Dropping a column while adding another in one `drizzle-kit generate` triggers its rename prompt;
  M11 split it into 0005 (adds) and 0006 (data carry-over + drops) instead.
- The web form uses `window.history.replaceState` after creating an item so the page keeps its
  state and notice while getting the item's URL.

Decision: [ADR 0006](../docs/adr/0006-child-entered-homework.md). Related: [[better-auth-parent-child]],
[[hono-route-conventions]], [[wording-child]].
