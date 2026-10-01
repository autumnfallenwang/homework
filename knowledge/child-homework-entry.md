---
name: child-homework-entry
description: Stage 2 (ADR 0006, M10) — per-child homework_source switch, parent-owned class list (replace-by-list with ids; archive/merge), child items + photos as bytea shrunk in the browser, "that's everything for today"; where each rule lives + pitfalls.
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

**Items / photos / day.** `assigned_on` is set by the server (local day, `toLocalIso`), never
edited. Photos: raw request body (not multipart), `bodyLimit` 2 MB, type sniffed from bytes
(JPEG/PNG/WebP), ≤ 4 per item under a `FOR UPDATE` lock on the item; served with
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

Decision: [ADR 0006](../docs/adr/0006-child-entered-homework.md). Related: [[better-auth-parent-child]],
[[hono-route-conventions]], [[wording-child]].
