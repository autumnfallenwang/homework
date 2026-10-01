// Child-entered homework (ADR 0006): the parent-owned class list, the child's
// items with their photos, and "that's everything for today". Every function
// takes the child id it acts for — from the session for a child, from the URL
// (parent-only routes) for a parent — and never touches another child's rows.

import {
  addDaysIso,
  type CreateHomeworkItemInput,
  HOMEWORK_LIMITS,
  type HomeworkClass,
  type HomeworkClassListInput,
  type HomeworkDay,
  type HomeworkItem,
  type HomeworkItemList,
  type HomeworkKind,
  type HomeworkPhotoRef,
  type HomeworkPhotoType,
  OTHER_CLASS_LABEL,
  type UpdateHomeworkItemInput,
} from "@homework/shared";
import { and, asc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { getLatestSuccessfulFetchRun } from "../db/queries.js";
import {
  childClasses,
  children,
  grades,
  homeworkDays,
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
  | "too_many_photos";

export class HomeworkEntryError extends Error {
  constructor(
    readonly code: HomeworkEntryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HomeworkEntryError";
  }
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
  status: homeworkItems.status,
  completedAt: homeworkItems.completedAt,
  createdAt: homeworkItems.createdAt,
  updatedAt: homeworkItems.updatedAt,
  createdByName: users.name,
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
  status: string;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdByName: string | null;
};

function toItem(row: ItemRow, photos: HomeworkPhotoRef[]): HomeworkItem {
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
    status: row.status === "done" ? "done" : "todo",
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdByName: row.createdByName,
    photos,
  };
}

async function photosFor(db: Database, itemIds: string[]) {
  const byItem = new Map<string, HomeworkPhotoRef[]>();
  if (itemIds.length === 0) return byItem;
  const rows = await db
    .select({
      id: homeworkPhotos.id,
      itemId: homeworkPhotos.itemId,
      contentType: homeworkPhotos.contentType,
      byteSize: homeworkPhotos.byteSize,
    })
    .from(homeworkPhotos)
    .where(inArray(homeworkPhotos.itemId, itemIds))
    .orderBy(asc(homeworkPhotos.createdAt), asc(homeworkPhotos.id));
  for (const r of rows) {
    const list = byItem.get(r.itemId) ?? [];
    list.push({ id: r.id, contentType: r.contentType, byteSize: r.byteSize });
    byItem.set(r.itemId, list);
  }
  return byItem;
}

function selectItems(db: Database) {
  return db
    .select(itemColumns)
    .from(homeworkItems)
    .leftJoin(childClasses, eq(childClasses.id, homeworkItems.classId))
    .leftJoin(users, eq(users.id, homeworkItems.createdBy));
}

export async function getDay(db: Database, childId: string, day: string): Promise<HomeworkDay> {
  const [row] = await db
    .select({ completedAt: homeworkDays.completedAt })
    .from(homeworkDays)
    .where(and(eq(homeworkDays.childId, childId), eq(homeworkDays.day, day)));
  return { date: day, completedAt: row?.completedAt.toISOString() ?? null };
}

/** Every to-do item, and done items due within the last 30 days. */
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
        or(eq(homeworkItems.status, "todo"), gte(homeworkItems.dueOn, since)),
      ),
    )
    .orderBy(asc(homeworkItems.dueOn), asc(homeworkItems.createdAt));
  const photos = await photosFor(
    db,
    rows.map((r) => r.id),
  );
  return {
    items: rows.map((r) => toItem(r, photos.get(r.id) ?? [])),
    today: await getDay(db, childId, today),
  };
}

/** Items given on or due on `day` — what Today and the digest show. */
export async function itemsForDay(
  db: Database,
  childId: string,
  day: string,
): Promise<{ givenToday: HomeworkItem[]; dueToday: HomeworkItem[] }> {
  const rows = await selectItems(db)
    .where(
      and(
        eq(homeworkItems.childId, childId),
        or(eq(homeworkItems.assignedOn, day), eq(homeworkItems.dueOn, day)),
      ),
    )
    .orderBy(asc(homeworkItems.createdAt));
  const photos = await photosFor(
    db,
    rows.map((r) => r.id),
  );
  const items = rows.map((r) => toItem(r, photos.get(r.id) ?? []));
  return {
    givenToday: items.filter((i) => i.assignedOn === day),
    dueToday: items.filter((i) => i.dueOn === day),
  };
}

/** One item; with `childId`, only if it belongs to that child. */
export async function getItem(
  db: Database,
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
  return toItem(row, photos.get(row.id) ?? []);
}

function cleanDetails(details: string | null | undefined): string | null {
  return details?.trim() ? details.trim() : null;
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
    if (input.classId) await assertActiveClass(tx, childId, input.classId);
    const [row] = await tx
      .insert(homeworkItems)
      .values({
        childId,
        classId: input.classId,
        kind: input.kind,
        title: input.title,
        details: cleanDetails(input.details),
        assignedOn: today,
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

export async function updateItem(
  db: Database,
  childId: string,
  itemId: string,
  input: UpdateHomeworkItemInput,
): Promise<HomeworkItem> {
  await db.transaction(async (tx) => {
    await assertEntryOn(tx, childId);
    const [current] = await tx
      .select({ classId: homeworkItems.classId, status: homeworkItems.status })
      .from(homeworkItems)
      .where(and(eq(homeworkItems.id, itemId), eq(homeworkItems.childId, childId)));
    if (!current) throw new HomeworkEntryError("item_not_found", "Homework not found");
    // Keeping an archived class is fine; moving onto one is not.
    if (input.classId && input.classId !== current.classId) {
      await assertActiveClass(tx, childId, input.classId);
    }
    const now = new Date();
    await tx
      .update(homeworkItems)
      .set({
        ...(input.classId !== undefined && { classId: input.classId }),
        ...(input.kind !== undefined && { kind: input.kind }),
        ...(input.title !== undefined && { title: input.title }),
        ...(input.details !== undefined && { details: cleanDetails(input.details) }),
        ...(input.dueOn !== undefined && { dueOn: input.dueOn }),
        ...(input.status !== undefined &&
          input.status !== current.status && {
            status: input.status,
            completedAt: input.status === "done" ? now : null,
          }),
        updatedAt: now,
      })
      .where(eq(homeworkItems.id, itemId));
  });
  const item = await getItem(db, itemId);
  if (!item) throw new HomeworkEntryError("item_not_found", "Homework not found");
  return item;
}

export async function deleteItem(db: Database, childId: string, itemId: string): Promise<void> {
  await assertEntryOn(db, childId);
  const deleted = await db
    .delete(homeworkItems)
    .where(and(eq(homeworkItems.id, itemId), eq(homeworkItems.childId, childId)))
    .returning({ id: homeworkItems.id });
  if (deleted.length === 0) throw new HomeworkEntryError("item_not_found", "Homework not found");
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

export async function addPhoto(
  db: Database,
  childId: string,
  itemId: string,
  bytes: Buffer,
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
    // Lock the item so two uploads at once cannot both pass the count check.
    const [item] = await tx
      .select({ id: homeworkItems.id })
      .from(homeworkItems)
      .where(and(eq(homeworkItems.id, itemId), eq(homeworkItems.childId, childId)))
      .for("update");
    if (!item) throw new HomeworkEntryError("item_not_found", "Homework not found");
    const [count] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(homeworkPhotos)
      .where(eq(homeworkPhotos.itemId, itemId));
    if ((count?.n ?? 0) >= HOMEWORK_LIMITS.photosPerItem) {
      throw new HomeworkEntryError("too_many_photos", "An item can have up to 4 photos");
    }
    const [row] = await tx
      .insert(homeworkPhotos)
      .values({ itemId, contentType, byteSize: bytes.length, bytes })
      .returning({
        id: homeworkPhotos.id,
        contentType: homeworkPhotos.contentType,
        byteSize: homeworkPhotos.byteSize,
      });
    if (!row) throw new Error("addPhoto: INSERT returned no id");
    await tx
      .update(homeworkItems)
      .set({ updatedAt: new Date() })
      .where(eq(homeworkItems.id, itemId));
    return row;
  });
}

/** A photo's bytes; with `childId`, only if its item belongs to that child. */
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
        ...(scope.childId ? [eq(homeworkItems.childId, scope.childId)] : []),
      ),
    );
  return row ?? null;
}

export async function deletePhoto(
  db: Database,
  childId: string,
  itemId: string,
  photoId: string,
): Promise<void> {
  await assertEntryOn(db, childId);
  const owned = await getItem(db, itemId, { childId });
  if (!owned) throw new HomeworkEntryError("item_not_found", "Homework not found");
  const deleted = await db
    .delete(homeworkPhotos)
    .where(and(eq(homeworkPhotos.id, photoId), eq(homeworkPhotos.itemId, itemId)))
    .returning({ id: homeworkPhotos.id });
  if (deleted.length === 0) throw new HomeworkEntryError("photo_not_found", "Photo not found");
}

// --- That's everything for today ---------------------------------------------

export async function setDayComplete(
  db: Database,
  childId: string,
  userId: string,
  day: string,
  complete: boolean,
): Promise<HomeworkDay> {
  await assertEntryOn(db, childId);
  if (complete) {
    await db
      .insert(homeworkDays)
      .values({ childId, day, completedBy: userId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(homeworkDays)
      .where(and(eq(homeworkDays.childId, childId), eq(homeworkDays.day, day)));
  }
  return getDay(db, childId, day);
}
