// Child-entered homework routes (ADR 0006, 0007, 0008).
//
// - `childHomeworkApp` (mounted at /api/child, child-only by path): the signed-in
//   child's own list, items, solutions, photos and classes — the child id always
//   comes from the session.
// - `childHomeworkAdminApp` (mounted at /api/children, parent-only): a child's list,
//   read only, and the parent-owned class list.
// - `homeworkItemsApp` (mounted at /api/homework-items, parent-only): one item, its
//   photos (removed ones too) and its history; the parent can delete it (ADR 0012).

import {
  createHomeworkItemSchema,
  HOMEWORK_LIMITS,
  type HomeworkClassSuggestions,
  homeworkClassListSchema,
  homeworkPhotoKindSchema,
  saveHomeworkSolutionSchema,
  updateHomeworkItemSchema,
} from "@homework/shared";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { db } from "../db/index.js";
import * as q from "../db/queries.js";
import { log } from "../lib/logger.js";
import type { AuthVariables } from "../middleware/auth.js";
import { toLocalIso } from "../services/digest.js";
import {
  addPhoto,
  classSuggestions,
  createItem,
  deleteItem,
  deletePhoto,
  getItem,
  getPhoto,
  HomeworkEntryError,
  type HomeworkEntryErrorCode,
  listClasses,
  listHistory,
  listItems,
  parentDeleteItem,
  replaceClasses,
  saveSolution,
  submitItem,
  updateItem,
} from "../services/homework-entry.js";

const ERROR_STATUS: Record<HomeworkEntryErrorCode, ContentfulStatusCode> = {
  entry_off: 403,
  child_not_found: 404,
  item_not_found: 404,
  class_not_found: 400,
  photo_not_found: 404,
  photo_type: 415,
  photo_too_large: 413,
  too_many_photos: 409,
  given_after_today: 400,
  due_before_given: 400,
  given_on_locked: 409,
  delete_locked: 409,
  nothing_to_submit: 400,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Map a service refusal to the house `{ error }` body (+ a `code` the web reads). */
function refuse(c: Context, err: unknown) {
  if (err instanceof HomeworkEntryError) {
    return c.json({ error: err.message, code: err.code }, ERROR_STATUS[err.code]);
  }
  throw err;
}

const notFound = (c: Context) => c.json({ error: "Not found" }, 404);
const today = () => toLocalIso(new Date());

function photoResponse(c: Context, photo: { contentType: string; bytes: Buffer }) {
  const body = new Uint8Array(photo.bytes);
  return c.body(body, 200, {
    "Content-Type": photo.contentType,
    // A photo never changes: a replaced photo is a new id.
    "Cache-Control": "private, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });
}

const photoBodyLimit = bodyLimit({
  maxSize: HOMEWORK_LIMITS.photoBytesMax,
  onError: (c) => c.json({ error: "The photo is larger than 2 MB", code: "photo_too_large" }, 413),
});

// --- The child's own (/api/child/*) -------------------------------------------

export const childHomeworkApp = new Hono<{ Variables: AuthVariables }>();

/** The session's child profile; a child login always has one (CHECK constraint). */
function sessionChild(c: Context<{ Variables: AuthVariables }>): string | null {
  return c.get("user").childId;
}

childHomeworkApp.get("/homework", async (c) => {
  const childId = sessionChild(c);
  if (!childId) return notFound(c);
  return c.json(await listItems(db, childId, today()));
});

childHomeworkApp.post("/homework", async (c) => {
  const childId = sessionChild(c);
  if (!childId) return notFound(c);
  const parsed = createHomeworkItemSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  try {
    return c.json(await createItem(db, childId, c.get("user").id, parsed.data, today()), 201);
  } catch (err) {
    return refuse(c, err);
  }
});

childHomeworkApp.get("/homework/:itemId", async (c) => {
  const childId = sessionChild(c);
  const itemId = c.req.param("itemId");
  if (!childId || !UUID.test(itemId)) return notFound(c);
  const item = await getItem(db, itemId, { childId });
  return item ? c.json(item) : notFound(c);
});

childHomeworkApp.patch("/homework/:itemId", async (c) => {
  const childId = sessionChild(c);
  const itemId = c.req.param("itemId");
  if (!childId || !UUID.test(itemId)) return notFound(c);
  const parsed = updateHomeworkItemSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  try {
    return c.json(await updateItem(db, childId, c.get("user").id, itemId, parsed.data, today()));
  } catch (err) {
    return refuse(c, err);
  }
});

// The solution's note; its photos go up as `kind=solution` photos.
childHomeworkApp.put("/homework/:itemId/solution", async (c) => {
  const childId = sessionChild(c);
  const itemId = c.req.param("itemId");
  if (!childId || !UUID.test(itemId)) return notFound(c);
  const parsed = saveHomeworkSolutionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  try {
    return c.json(await saveSolution(db, childId, c.get("user").id, itemId, parsed.data));
  } catch (err) {
    return refuse(c, err);
  }
});

// Submit (ADR 0011): done, recorded for the parent; again later is fine.
childHomeworkApp.post("/homework/:itemId/submit", async (c) => {
  const childId = sessionChild(c);
  const itemId = c.req.param("itemId");
  if (!childId || !UUID.test(itemId)) return notFound(c);
  try {
    return c.json(await submitItem(db, childId, c.get("user").id, itemId));
  } catch (err) {
    return refuse(c, err);
  }
});

childHomeworkApp.delete("/homework/:itemId", async (c) => {
  const childId = sessionChild(c);
  const itemId = c.req.param("itemId");
  if (!childId || !UUID.test(itemId)) return notFound(c);
  try {
    await deleteItem(db, childId, itemId);
    return c.body(null, 204);
  } catch (err) {
    return refuse(c, err);
  }
});

// The photo is the raw request body (the browser sends the shrunk JPEG as is);
// `?kind=solution` for the child's finished work, the sheet otherwise.
childHomeworkApp.post("/homework/:itemId/photos", photoBodyLimit, async (c) => {
  const childId = sessionChild(c);
  const itemId = c.req.param("itemId");
  if (!childId || !UUID.test(itemId)) return notFound(c);
  const kind = homeworkPhotoKindSchema.safeParse(c.req.query("kind") ?? "sheet");
  if (!kind.success) {
    return c.json({ error: "Validation failed", details: kind.error.issues }, 400);
  }
  const bytes = Buffer.from(await c.req.arrayBuffer());
  try {
    return c.json(await addPhoto(db, childId, c.get("user").id, itemId, bytes, kind.data), 201);
  } catch (err) {
    return refuse(c, err);
  }
});

childHomeworkApp.get("/homework/:itemId/photos/:photoId", async (c) => {
  const childId = sessionChild(c);
  const { itemId, photoId } = c.req.param();
  if (!childId || !UUID.test(itemId) || !UUID.test(photoId)) return notFound(c);
  const photo = await getPhoto(db, itemId, photoId, { childId });
  return photo ? photoResponse(c, photo) : notFound(c);
});

childHomeworkApp.delete("/homework/:itemId/photos/:photoId", async (c) => {
  const childId = sessionChild(c);
  const { itemId, photoId } = c.req.param();
  if (!childId || !UUID.test(itemId) || !UUID.test(photoId)) return notFound(c);
  try {
    await deletePhoto(db, childId, c.get("user").id, itemId, photoId);
    return c.body(null, 204);
  } catch (err) {
    return refuse(c, err);
  }
});

childHomeworkApp.get("/homework-classes", async (c) => {
  const childId = sessionChild(c);
  if (!childId) return notFound(c);
  return c.json(await listClasses(db, childId));
});

// --- The parent's view of a child (/api/children/:id/*) -----------------------

export const childHomeworkAdminApp = new Hono();

async function knownChild(id: string): Promise<boolean> {
  return UUID.test(id) && (await q.getChild(db, id)) !== null;
}

childHomeworkAdminApp.get("/:id/homework-items", async (c) => {
  const id = c.req.param("id");
  if (!(await knownChild(id))) return notFound(c);
  return c.json(await listItems(db, id, today()));
});

childHomeworkAdminApp.get("/:id/homework-classes/suggestions", async (c) => {
  const id = c.req.param("id");
  if (!(await knownChild(id))) return notFound(c);
  const body: HomeworkClassSuggestions = { names: await classSuggestions(db, id) };
  return c.json(body);
});

childHomeworkAdminApp.get("/:id/homework-classes", async (c) => {
  const id = c.req.param("id");
  if (!(await knownChild(id))) return notFound(c);
  return c.json(await listClasses(db, id));
});

childHomeworkAdminApp.put("/:id/homework-classes", async (c) => {
  const id = c.req.param("id");
  if (!(await knownChild(id))) return notFound(c);
  const parsed = homeworkClassListSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  try {
    return c.json(await replaceClasses(db, id, parsed.data));
  } catch (err) {
    return refuse(c, err);
  }
});

// --- One item: view, or delete (/api/homework-items/*) ------------------------

export const homeworkItemsApp = new Hono();

homeworkItemsApp.get("/:itemId", async (c) => {
  const itemId = c.req.param("itemId");
  if (!UUID.test(itemId)) return notFound(c);
  const item = await getItem(db, itemId);
  return item ? c.json(item) : notFound(c);
});

// The parent's Delete (ADR 0012): no first-day rule, nothing kept.
homeworkItemsApp.delete("/:itemId", async (c) => {
  const itemId = c.req.param("itemId");
  if (!UUID.test(itemId)) return notFound(c);
  const deleted = await parentDeleteItem(db, itemId);
  if (!deleted) return notFound(c);
  log.info(
    { event: "homework.deleted", item_id: itemId, child_id: deleted.childId, by: "parent" },
    "homework item deleted",
  );
  return c.body(null, 204);
});

homeworkItemsApp.get("/:itemId/history", async (c) => {
  const itemId = c.req.param("itemId");
  if (!UUID.test(itemId) || !(await getItem(db, itemId))) return notFound(c);
  return c.json(await listHistory(db, itemId));
});

homeworkItemsApp.get("/:itemId/photos/:photoId", async (c) => {
  const { itemId, photoId } = c.req.param();
  if (!UUID.test(itemId) || !UUID.test(photoId)) return notFound(c);
  const photo = await getPhoto(db, itemId, photoId);
  return photo ? photoResponse(c, photo) : notFound(c);
});
