// Child-entered homework (ADR 0006, 0007, 0008): the parent-owned class list, the
// child's items with their photos and solutions, and the history of changes made
// after an item's first day. Every function
// takes the child id it acts for — from the session for a child, from the URL
// (parent-only routes) for a parent — and never touches another child's rows.

import {
  addDaysIso,
  type CreateHomeworkItemInput,
  HOMEWORK_DATE_PROBLEMS,
  HOMEWORK_LIMITS,
  type HomeworkClass,
  type HomeworkClassListInput,
  type HomeworkDateProblem,
  type HomeworkHistoryEntry,
  type HomeworkItem,
  type HomeworkItemList,
  type HomeworkKind,
  type HomeworkPhotoKind,
  type HomeworkPhotoRef,
  type HomeworkPhotoType,
  homeworkDateProblem,
  OTHER_CLASS_LABEL,
  type SaveHomeworkSolutionInput,
  type UpdateHomeworkItemInput,
} from "@homework/shared";
import { and, asc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { getLatestSuccessfulFetchRun } from "../db/queries.js";
import {
  childClasses,
  children,
  grades,
  homeworkItemEvents,
  homeworkItems,
  homeworkPhotos,
  users,
} from "../db/schema.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type HomeworkEntryErrorCode =
  | "entry_off"
  | "child_not_found"
  | "item_not_found"
  | "class_not_found"
  | "photo_not_found"
  | "photo_type"
  | "photo_too_large"
  | "too_many_photos"
  | "given_on_locked"
  | "delete_locked"
  | "nothing_to_submit"
  | HomeworkDateProblem;

export class HomeworkEntryError extends Error {
  constructor(
    readonly code: HomeworkEntryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HomeworkEntryError";
  }
}

/** Given on or before the due day, never after today (the CHECK backs the first). */
function assertDates(dates: { assignedOn: string; dueOn: string }, today: string): void {
  const problem = homeworkDateProblem(dates, today);
  if (problem) throw new HomeworkEntryError(problem, HOMEWORK_DATE_PROBLEMS[problem]);
}

// --- The switch -------------------------------------------------------------

/** A child may write only while their profile is on 'child'. */
export async function assertEntryOn(db: Database | Tx, childId: string): Promise<void> {
  const [row] = await db
    .select({ source: children.homeworkSource })
    .from(children)
    .where(eq(children.id, childId));
  if (!row) throw new HomeworkEntryError("child_not_found", "Child not found");
  if (row.source !== "child") {
    throw new HomeworkEntryError("entry_off", "Homework entry is off for this child");
  }
}

// --- Class list -------------------------------------------------------------

export async function listClasses(db: Database, childId: string): Promise<HomeworkClass[]> {
  const rows = await db
    .select({ id: childClasses.id, name: childClasses.name, position: childClasses.position })
    .from(childClasses)
    .where(and(eq(childClasses.childId, childId), isNull(childClasses.archivedAt)))
    .orderBy(asc(childClasses.position), asc(childClasses.name));
  return rows;
}

/**
 * Replace a child's class list with `input.classes`, in order, in one
 * transaction. An entry with an id keeps that class (renamed if its name
 * changed); one without reuses an existing class of the same name (restoring an
 * archived one) or adds a new class. Classes left out are deleted, or archived
 * when items use them; one whose name a kept class now takes has its items moved
 * onto that class instead.
 */
export async function replaceClasses(
  db: Database,
  childId: string,
  input: HomeworkClassListInput,
): Promise<HomeworkClass[]> {
  await db.transaction(async (tx) => {
    const existing = await tx.select().from(childClasses).where(eq(childClasses.childId, childId));
    const byId = new Map(existing.map((r) => [r.id, r]));
    const claimed = new Map<string, { name: string; position: number }>();
    const toInsert: { name: string; position: number }[] = [];

    input.classes.forEach((entry, position) => {
      if (entry.id) {
        if (!byId.has(entry.id)) {
          throw new HomeworkEntryError("class_not_found", "Class not found");
        }
        claimed.set(entry.id, { name: entry.name, position });
      }
    });
    input.classes.forEach((entry, position) => {
      if (entry.id) return;
      const key = entry.name.toLowerCase();
      const match =
        existing.find((r) => !claimed.has(r.id) && !r.archivedAt && r.name.toLowerCase() === key) ??
        existing.find((r) => !claimed.has(r.id) && r.name.toLowerCase() === key);
      if (match) claimed.set(match.id, { name: entry.name, position });
      else toInsert.push({ name: entry.name, position });
    });

    // Classes left out: merge into the kept class that took their name, else
    // archive (items use them) or delete.
    const finalByName = new Map<string, string>();
    for (const [id, c] of claimed) finalByName.set(c.name.toLowerCase(), id);
    const removed = existing.filter((r) => !claimed.has(r.id));
    const usedIds = new Set(
      removed.length === 0
        ? []
        : (
            await tx
              .selectDistinct({ classId: homeworkItems.classId })
              .from(homeworkItems)
              .where(
                inArray(
                  homeworkItems.classId,
                  removed.map((r) => r.id),
                ),
              )
          ).map((r) => r.classId),
    );
    for (const row of removed) {
      const takenBy = finalByName.get(row.name.toLowerCase());
      if (takenBy) {
        await tx
          .update(homeworkItems)
          .set({ classId: takenBy })
          .where(eq(homeworkItems.classId, row.id));
        await tx.delete(childClasses).where(eq(childClasses.id, row.id));
      } else if (usedIds.has(row.id)) {
        if (!row.archivedAt) {
          await tx
            .update(childClasses)
            .set({ archivedAt: new Date() })
            .where(eq(childClasses.id, row.id));
        }
      } else {
        await tx.delete(childClasses).where(eq(childClasses.id, row.id));
      }
    }

    // Two steps so swapping names within one save never trips the unique index.
    const renamed = [...claimed].filter(([id, c]) => byId.get(id)?.name !== c.name);
    for (const [id] of renamed) {
      await tx
        .update(childClasses)
        .set({ name: `~renaming~${id}` })
        .where(eq(childClasses.id, id));
    }
    for (const [id, c] of claimed) {
      await tx
        .update(childClasses)
        .set({ name: c.name, position: c.position, archivedAt: null })
        .where(eq(childClasses.id, id));
    }
    if (toInsert.length > 0) {
      await tx.insert(childClasses).values(toInsert.map((c) => ({ childId, ...c })));
    }
  });
  return listClasses(db, childId);
}

/** Current TeacherEase class names (latest successful fetch), each once. */
export async function classSuggestions(db: Database, childId: string): Promise<string[]> {
  const run = await getLatestSuccessfulFetchRun(db, childId, "teacherease");
  if (!run) return [];
  const rows = await db
    .selectDistinct({ name: grades.className })
    .from(grades)
    .where(eq(grades.fetchRunId, run.id))
    .orderBy(asc(grades.className));
  return rows.map((r) => r.name);
}

async function assertActiveClass(db: Database | Tx, childId: string, classId: string) {
  const [row] = await db
    .select({ id: childClasses.id })
    .from(childClasses)
    .where(
      and(
        eq(childClasses.id, classId),
        eq(childClasses.childId, childId),
        isNull(childClasses.archivedAt),
      ),
    );
  if (!row) throw new HomeworkEntryError("class_not_found", "Pick one of the classes");
}

// --- The first day (ADR 0008) -------------------------------------------------

/**
 * When an item's first day ends: the next 7:00 AM (server TZ) after it was added.
 * Until then the child may change or delete anything and nothing is recorded;
 * after it Given on is locked, the item stays and every change is recorded.
 */
export function firstDayEndsAt(createdAt: Date): Date {
  const end = new Date(createdAt);
  end.setHours(HOMEWORK_LIMITS.firstDayEndsAtHour, 0, 0, 0);
  if (end <= createdAt) end.setDate(end.getDate() + 1);
  return end;
}

function inFirstDay(createdAt: Date, now: Date): boolean {
  return now < firstDayEndsAt(createdAt);
}

type HistoryChanges = Record<string, [string | null, string | null]>;

async function record(
  tx: Tx,
  event: {
    itemId: string;
    actorId: string;
    section: "homework" | "solution";
    action: "edited" | "photo_added" | "photo_removed" | "submitted";
    changes?: HistoryChanges;
    photoId?: string;
  },
): Promise<void> {
  await tx.insert(homeworkItemEvents).values({
    itemId: event.itemId,
    actorId: event.actorId,
    section: event.section,
    action: event.action,
    changes: event.changes ?? {},
    photoId: event.photoId ?? null,
  });
}

// --- Items ------------------------------------------------------------------

const itemColumns = {
  id: homeworkItems.id,
  childId: homeworkItems.childId,
  classId: homeworkItems.classId,
  className: childClasses.name,
  kind: homeworkItems.kind,
  title: homeworkItems.title,
  details: homeworkItems.details,
  assignedOn: homeworkItems.assignedOn,
  dueOn: homeworkItems.dueOn,
  solutionNote: homeworkItems.solutionNote,
  solutionSavedAt: homeworkItems.solutionSavedAt,
  submittedAt: homeworkItems.submittedAt,
  createdAt: homeworkItems.createdAt,
  updatedAt: homeworkItems.updatedAt,
  createdByName: users.name,
  edited:
    sql<boolean>`exists (select 1 from homework_item_events e where e.item_id = ${homeworkItems.id})`.as(
      "edited",
    ),
};

type ItemRow = {
  id: string;
  childId: string;
  classId: string | null;
  className: string | null;
  kind: string;
  title: string;
  details: string | null;
  assignedOn: string;
  dueOn: string;
  solutionNote: string | null;
  solutionSavedAt: Date | null;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdByName: string | null;
  edited: boolean;
};

type ItemPhotos = { sheet: HomeworkPhotoRef[]; solution: HomeworkPhotoRef[] };

function toItem(row: ItemRow, photos: ItemPhotos | undefined): HomeworkItem {
  const solutionPhotos = photos?.solution ?? [];
  return {
    id: row.id,
    childId: row.childId,
    classId: row.className === null ? null : row.classId,
    className: row.className ?? OTHER_CLASS_LABEL,
    kind: row.kind as HomeworkKind,
    title: row.title,
    details: row.details,
    assignedOn: row.assignedOn,
    dueOn: row.dueOn,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdByName: row.createdByName,
    photos: photos?.sheet ?? [],
    solution: {
      note: row.solutionNote,
      photos: solutionPhotos,
      savedAt: row.solutionSavedAt?.toISOString() ?? null,
    },
    hasSolution: row.solutionNote !== null || solutionPhotos.length > 0,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    firstDayEndsAt: firstDayEndsAt(row.createdAt).toISOString(),
    edited: row.edited,
  };
}

/** The photos the child still sees, by item and kind. */
async function photosFor(db: Database | Tx, itemIds: string[]) {
  const byItem = new Map<string, ItemPhotos>();
  if (itemIds.length === 0) return byItem;
  const rows = await db
    .select({
      id: homeworkPhotos.id,
      itemId: homeworkPhotos.itemId,
      kind: homeworkPhotos.kind,
      contentType: homeworkPhotos.contentType,
      byteSize: homeworkPhotos.byteSize,
    })
    .from(homeworkPhotos)
    .where(and(inArray(homeworkPhotos.itemId, itemIds), isNull(homeworkPhotos.removedAt)))
    .orderBy(asc(homeworkPhotos.createdAt), asc(homeworkPhotos.id));
  for (const r of rows) {
    const entry = byItem.get(r.itemId) ?? { sheet: [], solution: [] };
    const kind = r.kind === "solution" ? "solution" : "sheet";
    entry[kind].push({ id: r.id, kind, contentType: r.contentType, byteSize: r.byteSize });
    byItem.set(r.itemId, entry);
  }
  return byItem;
}

function selectItems(db: Database | Tx) {
  return db
    .select(itemColumns)
    .from(homeworkItems)
    .leftJoin(childClasses, eq(childClasses.id, homeworkItems.classId))
    .leftJoin(users, eq(users.id, homeworkItems.createdBy));
}

/** Every item not submitted, and done (submitted) items due within the last 30 days. */
export async function listItems(
  db: Database,
  childId: string,
  today: string,
): Promise<HomeworkItemList> {
  const since = addDaysIso(today, -HOMEWORK_LIMITS.doneVisibleDays);
  const rows = await selectItems(db)
    .where(
      and(
        eq(homeworkItems.childId, childId),
        or(isNull(homeworkItems.submittedAt), gte(homeworkItems.dueOn, since)),
      ),
    )
    .orderBy(asc(homeworkItems.dueOn), asc(homeworkItems.createdAt));
  const photos = await photosFor(
    db,
    rows.map((r) => r.id),
  );
  return { items: rows.map((r) => toItem(r, photos.get(r.id))), today };
}

/**
 * Items given on `givenDay` or due on `dueDay` — what the digest shows ("homework
 * for today" and "due tomorrow", the next hand-in day).
 */
export async function itemsForDay(
  db: Database,
  childId: string,
  givenDay: string,
  dueDay: string,
): Promise<{ givenToday: HomeworkItem[]; dueNext: HomeworkItem[] }> {
  const rows = await selectItems(db)
    .where(
      and(
        eq(homeworkItems.childId, childId),
        or(eq(homeworkItems.assignedOn, givenDay), eq(homeworkItems.dueOn, dueDay)),
      ),
    )
    .orderBy(asc(homeworkItems.createdAt));
  const photos = await photosFor(
    db,
    rows.map((r) => r.id),
  );
  const items = rows.map((r) => toItem(r, photos.get(r.id)));
  return {
    givenToday: items.filter((i) => i.assignedOn === givenDay),
    dueNext: items.filter((i) => i.dueOn === dueDay),
  };
}

/** One item; with `childId`, only if it belongs to that child. */
export async function getItem(
  db: Database | Tx,
  itemId: string,
  scope: { childId?: string } = {},
): Promise<HomeworkItem | null> {
  const [row] = await selectItems(db).where(
    scope.childId
      ? and(eq(homeworkItems.id, itemId), eq(homeworkItems.childId, scope.childId))
      : eq(homeworkItems.id, itemId),
  );
  if (!row) return null;
  const photos = await photosFor(db, [row.id]);
  return toItem(row, photos.get(row.id));
}

function cleanText(text: string | null | undefined): string | null {
  return text?.trim() ? text.trim() : null;
}

export async function createItem(
  db: Database,
  childId: string,
  userId: string,
  input: CreateHomeworkItemInput,
  today: string,
): Promise<HomeworkItem> {
  const id = await db.transaction(async (tx) => {
    await assertEntryOn(tx, childId);
    assertDates(input, today);
    if (input.classId) await assertActiveClass(tx, childId, input.classId);
    const [row] = await tx
      .insert(homeworkItems)
      .values({
        childId,
        classId: input.classId,
        kind: input.kind,
        title: input.title,
        details: cleanText(input.details),
        assignedOn: input.assignedOn,
        dueOn: input.dueOn,
        createdBy: userId,
      })
      .returning({ id: homeworkItems.id });
    if (!row) throw new Error("createItem: INSERT returned no id");
    return row.id;
  });
  const item = await getItem(db, id);
  if (!item) throw new Error("createItem: item vanished");
  return item;
}

/** The child's own item, locked for the rest of the transaction. */
async function ownItem(tx: Tx, childId: string, itemId: string) {
  const [row] = await tx
    .select({
      classId: homeworkItems.classId,
      kind: homeworkItems.kind,
      title: homeworkItems.title,
      details: homeworkItems.details,
      assignedOn: homeworkItems.assignedOn,
      dueOn: homeworkItems.dueOn,
      solutionNote: homeworkItems.solutionNote,
      createdAt: homeworkItems.createdAt,
    })
    .from(homeworkItems)
    .where(and(eq(homeworkItems.id, itemId), eq(homeworkItems.childId, childId)))
    .for("update");
  if (!row) throw new HomeworkEntryError("item_not_found", "Homework not found");
  return row;
}

async function className(tx: Tx, classId: string | null): Promise<string> {
  if (!classId) return OTHER_CLASS_LABEL;
  const [row] = await tx
    .select({ name: childClasses.name })
    .from(childClasses)
    .where(eq(childClasses.id, classId));
  return row?.name ?? OTHER_CLASS_LABEL;
}

/** The homework section. After the first day Given on is locked and changes are recorded. */
export async function updateItem(
  db: Database,
  childId: string,
  userId: string,
  itemId: string,
  input: UpdateHomeworkItemInput,
  today: string,
  now: Date = new Date(),
): Promise<HomeworkItem> {
  await db.transaction(async (tx) => {
    await assertEntryOn(tx, childId);
    const current = await ownItem(tx, childId, itemId);
    const firstDay = inFirstDay(current.createdAt, now);
    if (!firstDay && input.assignedOn !== undefined && input.assignedOn !== current.assignedOn) {
      throw new HomeworkEntryError("given_on_locked", "Given on can't change after the first day");
    }
    if (input.assignedOn !== undefined || input.dueOn !== undefined) {
      assertDates(
        { assignedOn: input.assignedOn ?? current.assignedOn, dueOn: input.dueOn ?? current.dueOn },
        today,
      );
    }
    // Keeping an archived class is fine; moving onto one is not.
    if (input.classId && input.classId !== current.classId) {
      await assertActiveClass(tx, childId, input.classId);
    }

    const next = {
      classId: input.classId === undefined ? current.classId : input.classId,
      kind: input.kind ?? current.kind,
      title: input.title ?? current.title,
      details: input.details === undefined ? current.details : cleanText(input.details),
      assignedOn: input.assignedOn ?? current.assignedOn,
      dueOn: input.dueOn ?? current.dueOn,
    };
    const changes: HistoryChanges = {};
    if (next.classId !== current.classId) {
      changes.class = [await className(tx, current.classId), await className(tx, next.classId)];
    }
    for (const field of ["kind", "title", "details", "assignedOn", "dueOn"] as const) {
      if (next[field] !== current[field]) changes[field] = [current[field], next[field]];
    }
    if (Object.keys(changes).length === 0) return;

    await tx
      .update(homeworkItems)
      .set({ ...next, updatedAt: now })
      .where(eq(homeworkItems.id, itemId));
    if (!firstDay) {
      await record(tx, { itemId, actorId: userId, section: "homework", action: "edited", changes });
    }
  });
  const item = await getItem(db, itemId);
  if (!item) throw new HomeworkEntryError("item_not_found", "Homework not found");
  return item;
}

/** The solution's note. After the first day the change is recorded. */
export async function saveSolution(
  db: Database,
  childId: string,
  userId: string,
  itemId: string,
  input: SaveHomeworkSolutionInput,
  now: Date = new Date(),
): Promise<HomeworkItem> {
  await db.transaction(async (tx) => {
    await assertEntryOn(tx, childId);
    const current = await ownItem(tx, childId, itemId);
    const note = cleanText(input.note);
    if (note === current.solutionNote) return;
    await tx
      .update(homeworkItems)
      .set({ solutionNote: note, solutionSavedAt: now, updatedAt: now })
      .where(eq(homeworkItems.id, itemId));
    if (!inFirstDay(current.createdAt, now)) {
      await record(tx, {
        itemId,
        actorId: userId,
        section: "solution",
        action: "edited",
        changes: { note: [current.solutionNote, note] },
      });
    }
  });
  const item = await getItem(db, itemId);
  if (!item) throw new HomeworkEntryError("item_not_found", "Homework not found");
  return item;
}

/**
 * Submit (ADR 0011): marks the item done at `now` and records it — every time,
 * even on the first day. Needs a saved solution note; editing afterwards keeps it
 * done, and Submit again moves the time.
 */
export async function submitItem(
  db: Database,
  childId: string,
  userId: string,
  itemId: string,
  now: Date = new Date(),
): Promise<HomeworkItem> {
  await db.transaction(async (tx) => {
    await assertEntryOn(tx, childId);
    const current = await ownItem(tx, childId, itemId);
    if (current.solutionNote === null) {
      throw new HomeworkEntryError("nothing_to_submit", "Write a note and save the solution first");
    }
    await tx
      .update(homeworkItems)
      .set({ submittedAt: now, updatedAt: now })
      .where(eq(homeworkItems.id, itemId));
    await record(tx, { itemId, actorId: userId, section: "solution", action: "submitted" });
  });
  const item = await getItem(db, itemId);
  if (!item) throw new HomeworkEntryError("item_not_found", "Homework not found");
  return item;
}

/** Only on the first day; after it an item stays. */
export async function deleteItem(
  db: Database,
  childId: string,
  itemId: string,
  now: Date = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    await assertEntryOn(tx, childId);
    const current = await ownItem(tx, childId, itemId);
    if (!inFirstDay(current.createdAt, now)) {
      throw new HomeworkEntryError(
        "delete_locked",
        "Homework can only be deleted on the day it was added",
      );
    }
    await tx.delete(homeworkItems).where(eq(homeworkItems.id, itemId));
  });
}

/** Changes recorded after the first day, oldest first (the parent's view). */
export async function listHistory(db: Database, itemId: string): Promise<HomeworkHistoryEntry[]> {
  const rows = await db
    .select({
      id: homeworkItemEvents.id,
      at: homeworkItemEvents.at,
      actorName: users.name,
      section: homeworkItemEvents.section,
      action: homeworkItemEvents.action,
      changes: homeworkItemEvents.changes,
      photoId: homeworkPhotos.id,
      photoKind: homeworkPhotos.kind,
      photoContentType: homeworkPhotos.contentType,
      photoByteSize: homeworkPhotos.byteSize,
      photoRemovedAt: homeworkPhotos.removedAt,
    })
    .from(homeworkItemEvents)
    .leftJoin(users, eq(users.id, homeworkItemEvents.actorId))
    .leftJoin(homeworkPhotos, eq(homeworkPhotos.id, homeworkItemEvents.photoId))
    .where(eq(homeworkItemEvents.itemId, itemId))
    .orderBy(asc(homeworkItemEvents.at), asc(homeworkItemEvents.id));
  return rows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    actorName: r.actorName,
    section: r.section === "solution" ? "solution" : "homework",
    action: r.action as HomeworkHistoryEntry["action"],
    changes: r.changes,
    photo:
      r.photoId && r.photoKind && r.photoContentType && r.photoByteSize !== null
        ? {
            id: r.photoId,
            kind: r.photoKind === "solution" ? "solution" : "sheet",
            contentType: r.photoContentType,
            byteSize: r.photoByteSize,
            removed: r.photoRemovedAt !== null,
          }
        : null,
  }));
}

// --- Photos -----------------------------------------------------------------

/** The image type from the file's first bytes — never from the name or header. */
export function sniffPhotoType(bytes: Uint8Array): HomeworkPhotoType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

const PHOTO_SECTION: Record<HomeworkPhotoKind, "homework" | "solution"> = {
  sheet: "homework",
  solution: "solution",
};

export async function addPhoto(
  db: Database,
  childId: string,
  userId: string,
  itemId: string,
  bytes: Buffer,
  kind: HomeworkPhotoKind = "sheet",
  now: Date = new Date(),
): Promise<HomeworkPhotoRef> {
  if (bytes.length > HOMEWORK_LIMITS.photoBytesMax) {
    throw new HomeworkEntryError("photo_too_large", "The photo is larger than 2 MB");
  }
  const contentType = sniffPhotoType(bytes);
  if (!contentType) {
    throw new HomeworkEntryError("photo_type", "Only JPEG, PNG or WebP photos can be added");
  }
  return db.transaction(async (tx) => {
    await assertEntryOn(tx, childId);
    // The lock on the item keeps two uploads at once from both passing the count.
    const item = await ownItem(tx, childId, itemId);
    const [count] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(homeworkPhotos)
      .where(
        and(
          eq(homeworkPhotos.itemId, itemId),
          eq(homeworkPhotos.kind, kind),
          isNull(homeworkPhotos.removedAt),
        ),
      );
    if ((count?.n ?? 0) >= HOMEWORK_LIMITS.photosPerSection) {
      throw new HomeworkEntryError(
        "too_many_photos",
        `${kind === "sheet" ? "The homework" : "A solution"} can have up to ${HOMEWORK_LIMITS.photosPerSection} photos`,
      );
    }
    const [row] = await tx
      .insert(homeworkPhotos)
      .values({ itemId, kind, contentType, byteSize: bytes.length, bytes })
      .returning({
        id: homeworkPhotos.id,
        contentType: homeworkPhotos.contentType,
        byteSize: homeworkPhotos.byteSize,
      });
    if (!row) throw new Error("addPhoto: INSERT returned no id");
    await tx
      .update(homeworkItems)
      .set({ updatedAt: now, ...(kind === "solution" && { solutionSavedAt: now }) })
      .where(eq(homeworkItems.id, itemId));
    if (!inFirstDay(item.createdAt, now)) {
      await record(tx, {
        itemId,
        actorId: userId,
        section: PHOTO_SECTION[kind],
        action: "photo_added",
        photoId: row.id,
      });
    }
    return { ...row, kind };
  });
}

/**
 * A photo's bytes; with `childId`, only if its item belongs to that child and the
 * photo was not removed. The parent can open removed photos from the history.
 */
export async function getPhoto(
  db: Database,
  itemId: string,
  photoId: string,
  scope: { childId?: string } = {},
): Promise<{ contentType: string; bytes: Buffer } | null> {
  const [row] = await db
    .select({ contentType: homeworkPhotos.contentType, bytes: homeworkPhotos.bytes })
    .from(homeworkPhotos)
    .innerJoin(homeworkItems, eq(homeworkItems.id, homeworkPhotos.itemId))
    .where(
      and(
        eq(homeworkPhotos.id, photoId),
        eq(homeworkPhotos.itemId, itemId),
        ...(scope.childId
          ? [eq(homeworkItems.childId, scope.childId), isNull(homeworkPhotos.removedAt)]
          : []),
      ),
    );
  return row ?? null;
}

/** On the first day a photo is deleted; after it, hidden from the child and recorded. */
export async function deletePhoto(
  db: Database,
  childId: string,
  userId: string,
  itemId: string,
  photoId: string,
  now: Date = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    await assertEntryOn(tx, childId);
    const item = await ownItem(tx, childId, itemId);
    const [photo] = await tx
      .select({ kind: homeworkPhotos.kind })
      .from(homeworkPhotos)
      .where(
        and(
          eq(homeworkPhotos.id, photoId),
          eq(homeworkPhotos.itemId, itemId),
          isNull(homeworkPhotos.removedAt),
        ),
      );
    if (!photo) throw new HomeworkEntryError("photo_not_found", "Photo not found");
    const kind: HomeworkPhotoKind = photo.kind === "solution" ? "solution" : "sheet";
    if (inFirstDay(item.createdAt, now)) {
      await tx.delete(homeworkPhotos).where(eq(homeworkPhotos.id, photoId));
    } else {
      await tx.update(homeworkPhotos).set({ removedAt: now }).where(eq(homeworkPhotos.id, photoId));
      await record(tx, {
        itemId,
        actorId: userId,
        section: PHOTO_SECTION[kind],
        action: "photo_removed",
        photoId,
      });
    }
    await tx
      .update(homeworkItems)
      .set({ updatedAt: now, ...(kind === "solution" && { solutionSavedAt: now }) })
      .where(eq(homeworkItems.id, itemId));
  });
}
