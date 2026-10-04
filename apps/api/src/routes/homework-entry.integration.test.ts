// Child-entered homework (ADR 0006) end to end on the live Postgres: the
// switch, the parent-owned class list, the child's items and photos, the day,
// what the parent reads, the digest, and who can touch whose rows.

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { closeDb, db } from "../db/index.js";
import { children, homeworkItems, homeworkPhotos, users } from "../db/schema.js";
import { seedSettings } from "../db/seed-settings.js";
import { HomeworkSource } from "../fetch/homework-source.js";
import type { SessionUser } from "../middleware/auth.js";
import { buildDigestFromDb, renderDigestEmail, toLocalIso } from "../services/digest.js";
import { PARENT } from "../test/sessions.js";

const url = process.env.DATABASE_URL;

let session: SessionUser | null = null;
const app = createApp({ resolveSession: async () => session });

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
const TODAY = toLocalIso(new Date());
/** TODAY moved by `offset` days. */
function day(offset: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function send(method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function upload(path: string, bytes: Buffer, type = "image/jpeg") {
  return app.request(path, { method: "POST", headers: { "Content-Type": type }, body: bytes });
}

async function addProfile(name: string): Promise<string> {
  const [row] = await db
    .insert(children)
    .values({ displayName: name, baseUrl: "https://x.example.com", username: `${name}@e.com` })
    .returning({ id: children.id });
  if (!row) throw new Error("no child");
  return row.id;
}

async function addChildLogin(childId: string, name: string): Promise<SessionUser> {
  const email = `${name.toLowerCase()}@example.com`;
  const [row] = await db
    .insert(users)
    .values({ name, email, role: "child", childId })
    .returning({ id: users.id });
  if (!row) throw new Error("no user");
  return { id: row.id, name, email, role: "child", childId };
}

describe.skipIf(!url)("child-entered homework (live DB)", () => {
  let ivyId: string;
  let ivy: SessionUser;
  let samId: string;
  let sam: SessionUser;

  const asParent = () => {
    session = PARENT;
  };
  const asIvy = () => {
    session = ivy;
  };
  const asSam = () => {
    session = sam;
  };

  beforeEach(async () => {
    await db.delete(children); // cascades to logins, classes, items, photos
    await db.delete(users);
    await seedSettings(db);
    ivyId = await addProfile("Ivy");
    samId = await addProfile("Sam");
    ivy = await addChildLogin(ivyId, "Ivy");
    sam = await addChildLogin(samId, "Sam");
  });

  afterAll(async () => {
    await db.delete(children);
    await db.delete(users);
    await closeDb();
  });

  async function turnOn(childId: string) {
    asParent();
    const res = await send("PATCH", `/api/children/${childId}`, { homeworkSource: "child" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { homeworkSource: string }).homeworkSource).toBe("child");
  }

  async function setClasses(childId: string, classes: { id?: string; name: string }[]) {
    asParent();
    const res = await send("PUT", `/api/children/${childId}/homework-classes`, { classes });
    expect(res.status).toBe(200);
    return (await res.json()) as { id: string; name: string; position: number }[];
  }

  async function addItem(body: Record<string, unknown>) {
    const res = await send("POST", "/api/child/homework", {
      kind: "homework",
      details: null,
      assignedOn: TODAY,
      dueOn: "2030-01-15",
      ...body,
    });
    expect(res.status).toBe(201);
    return (await res.json()) as Record<string, unknown> & { id: string };
  }

  it("refuses a child's writes until the parent turns entry on; reads still work", async () => {
    asIvy();
    const off = await send("POST", "/api/child/homework", {
      classId: null,
      kind: "homework",
      title: "Read ch. 6",
      assignedOn: TODAY,
      dueOn: "2030-01-15",
    });
    expect(off.status).toBe(403);
    expect(((await off.json()) as { code: string }).code).toBe("entry_off");
    expect((await send("GET", "/api/child/homework")).status).toBe(200);
    expect(
      ((await (await send("GET", "/api/child/profile")).json()) as { homeworkEntry: boolean })
        .homeworkEntry,
    ).toBe(false);

    await turnOn(ivyId);
    asIvy();
    expect(
      ((await (await send("GET", "/api/child/profile")).json()) as { homeworkEntry: boolean })
        .homeworkEntry,
    ).toBe(true);
    const item = await addItem({ classId: null, title: "Read ch. 6" });
    expect(item).toMatchObject({
      className: "Other",
      classId: null,
      title: "Read ch. 6",
      assignedOn: TODAY,
      hasSolution: false,
      edited: false,
      createdByName: "Ivy",
      photos: [],
    });

    // Off again: the list stays readable, writes stop.
    asParent();
    await send("PATCH", `/api/children/${ivyId}`, { homeworkSource: "page" });
    asIvy();
    expect((await send("PATCH", `/api/child/homework/${item.id}`, { title: "x" })).status).toBe(
      403,
    );
    expect(
      (await send("PUT", `/api/child/homework/${item.id}/solution`, { note: "x" })).status,
    ).toBe(403);
    const list = (await (await send("GET", "/api/child/homework")).json()) as { items: unknown[] };
    expect(list.items).toHaveLength(1);
  });

  it("keeps the class list the parent's: order, Other reserved, rename, archive, restore, merge", async () => {
    await turnOn(ivyId);
    const [math, science] = await setClasses(ivyId, [{ name: "Math" }, { name: "Science" }]);
    expect([math?.name, science?.name]).toEqual(["Math", "Science"]);

    asParent();
    for (const classes of [[{ name: "other" }], [{ name: "Art" }, { name: "art" }]]) {
      const bad = await send("PUT", `/api/children/${ivyId}/homework-classes`, { classes });
      expect(bad.status).toBe(400);
    }

    asIvy();
    const kids = (await (await send("GET", "/api/child/homework-classes")).json()) as unknown[];
    expect(kids).toHaveLength(2);
    const item = await addItem({ classId: science?.id, kind: "test", title: "Ch. 2 test" });
    expect(item.className).toBe("Science");

    // A rename follows onto old items; a swap of names in one save is fine.
    await setClasses(ivyId, [
      { id: science?.id, name: "Math" },
      { id: math?.id, name: "Science" },
    ]);
    asIvy();
    let read = (await (await send("GET", `/api/child/homework/${item.id}`)).json()) as {
      className: string;
      classId: string;
    };
    expect(read.className).toBe("Math");

    // Removing a used class archives it: gone from the picker, kept on the item.
    await setClasses(ivyId, [{ id: math?.id, name: "Science" }]);
    asIvy();
    const picker = (await (await send("GET", "/api/child/homework-classes")).json()) as {
      name: string;
    }[];
    expect(picker.map((c) => c.name)).toEqual(["Science"]);
    read = (await (await send("GET", `/api/child/homework/${item.id}`)).json()) as typeof read;
    expect(read).toMatchObject({ className: "Math", classId: science?.id });
    // …and it cannot be picked for a new item.
    const archived = await send("POST", "/api/child/homework", {
      classId: science?.id,
      kind: "homework",
      title: "x",
      assignedOn: TODAY,
      dueOn: "2030-01-15",
    });
    expect(archived.status).toBe(400);
    expect(((await archived.json()) as { code: string }).code).toBe("class_not_found");

    // Re-adding the name restores the same class.
    const restored = await setClasses(ivyId, [{ id: math?.id, name: "Science" }, { name: "math" }]);
    expect(restored.find((c) => c.name === "math")?.id).toBe(science?.id);

    // Renaming a kept class onto a removed one's name moves the items over.
    await setClasses(ivyId, [{ id: math?.id, name: "math" }]);
    asIvy();
    read = (await (await send("GET", `/api/child/homework/${item.id}`)).json()) as typeof read;
    expect(read).toMatchObject({ className: "math", classId: math?.id });
  });

  it("keeps each child to their own items, classes and photos", async () => {
    await turnOn(ivyId);
    await turnOn(samId);
    const [samClass] = await setClasses(samId, [{ name: "Band" }]);
    asIvy();
    const item = await addItem({ classId: null, title: "Ivy's" });
    // Ivy cannot use Sam's class.
    const cross = await send("POST", "/api/child/homework", {
      classId: samClass?.id,
      kind: "homework",
      title: "x",
      assignedOn: TODAY,
      dueOn: "2030-01-15",
    });
    expect(cross.status).toBe(400);
    expect(((await cross.json()) as { code: string }).code).toBe("class_not_found");
    const photo = (await (await upload(`/api/child/homework/${item.id}/photos`, JPEG)).json()) as {
      id: string;
    };

    asSam();
    expect((await send("GET", `/api/child/homework/${item.id}`)).status).toBe(404);
    expect((await send("PATCH", `/api/child/homework/${item.id}`, { title: "mine" })).status).toBe(
      404,
    );
    expect((await send("DELETE", `/api/child/homework/${item.id}`)).status).toBe(404);
    expect((await upload(`/api/child/homework/${item.id}/photos`, JPEG)).status).toBe(404);
    expect((await send("GET", `/api/child/homework/${item.id}/photos/${photo.id}`)).status).toBe(
      404,
    );
    expect((await send("DELETE", `/api/child/homework/${item.id}/photos/${photo.id}`)).status).toBe(
      404,
    );
    const samList = (await (await send("GET", "/api/child/homework")).json()) as {
      items: unknown[];
    };
    expect(samList.items).toHaveLength(0);
    expect((await send("GET", "/api/child/homework/not-a-uuid")).status).toBe(404);
  });

  it("edits and deletes an item on its first day", async () => {
    await turnOn(ivyId);
    const [math] = await setClasses(ivyId, [{ name: "Math" }]);
    asIvy();
    const item = await addItem({ classId: math?.id, title: "Worksheet 2.3", details: "  " });
    expect(item.details).toBeNull();

    const res = await send("PATCH", `/api/child/homework/${item.id}`, {
      title: "Worksheet 2.3, q 1–8",
      details: "Show your work",
      kind: "project",
      dueOn: "2030-02-01",
      classId: null,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      title: "Worksheet 2.3, q 1–8",
      details: "Show your work",
      kind: "project",
      dueOn: "2030-02-01",
      className: "Other",
    });

    // The tick is gone: status is not a field any more.
    for (const bad of [
      {},
      { title: "" },
      { dueOn: "2030-02-30" },
      { kind: "essay" },
      { status: "done" },
    ]) {
      expect((await send("PATCH", `/api/child/homework/${item.id}`, bad)).status).toBe(400);
    }

    expect((await send("DELETE", `/api/child/homework/${item.id}`)).status).toBe(204);
    expect((await send("GET", `/api/child/homework/${item.id}`)).status).toBe(404);
  });

  it("takes up to four real photos of at most 2 MB and serves them to the child and the parent", async () => {
    await turnOn(ivyId);
    asIvy();
    const item = await addItem({ classId: null, title: "Worksheet" });
    const path = `/api/child/homework/${item.id}/photos`;

    expect((await upload(path, Buffer.from("not an image"), "image/jpeg")).status).toBe(415);
    expect((await upload(path, Buffer.alloc(2 * 1024 * 1024 + 1, 0xff))).status).toBe(413);

    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await upload(path, JPEG);
      expect(res.status).toBe(201);
      ids.push(((await res.json()) as { id: string }).id);
    }
    const fifth = await upload(path, JPEG);
    expect(fifth.status).toBe(409);
    expect(((await fifth.json()) as { code: string }).code).toBe("too_many_photos");

    const got = await send("GET", `${path}/${ids[0]}`);
    expect(got.status).toBe(200);
    expect(got.headers.get("content-type")).toBe("image/jpeg");
    expect(got.headers.get("cache-control")).toContain("immutable");
    expect(Buffer.from(await got.arrayBuffer()).equals(JPEG)).toBe(true);

    asParent();
    const parentGot = await send("GET", `/api/homework-items/${item.id}/photos/${ids[1]}`);
    expect(parentGot.status).toBe(200);
    const parentItem = (await (await send("GET", `/api/homework-items/${item.id}`)).json()) as {
      photos: { id: string }[];
    };
    expect(parentItem.photos.map((p) => p.id)).toEqual(ids);

    asIvy();
    expect((await send("DELETE", `${path}/${ids[0]}`)).status).toBe(204);
    expect((await upload(path, JPEG)).status).toBe(201);

    // Deleting the item deletes its photos.
    await send("DELETE", `/api/child/homework/${item.id}`);
    const left = await db.select().from(homeworkPhotos).where(eq(homeworkPhotos.itemId, item.id));
    expect(left).toHaveLength(0);
  });

  it("takes the given-on day from the child and holds it to on-or-before due, never after today", async () => {
    await turnOn(ivyId);
    asIvy();
    // Homework given yesterday, entered today.
    const item = await addItem({ classId: null, title: "Given yesterday", assignedOn: day(-1) });
    expect(item).toMatchObject({ assignedOn: day(-1) });
    // Given and due the same day is fine.
    await addItem({ classId: null, title: "Same day", assignedOn: TODAY, dueOn: TODAY });

    const refused = async (res: Response, code: string) => {
      expect(res.status).toBe(400);
      expect(((await res.json()) as { code: string }).code).toBe(code);
    };
    const create = (dates: { assignedOn: string; dueOn: string }) =>
      send("POST", "/api/child/homework", {
        classId: null,
        kind: "homework",
        title: "x",
        ...dates,
      });
    await refused(await create({ assignedOn: day(1), dueOn: day(5) }), "given_after_today");
    await refused(await create({ assignedOn: day(-1), dueOn: day(-2) }), "due_before_given");
    // A missing given-on day is a validation error.
    expect(
      (
        await send("POST", "/api/child/homework", {
          classId: null,
          kind: "homework",
          title: "x",
          dueOn: TODAY,
        })
      ).status,
    ).toBe(400);

    // On edit the rule holds against the stored day the edit leaves alone.
    const path = `/api/child/homework/${item.id}`;
    await refused(await send("PATCH", path, { dueOn: day(-2) }), "due_before_given");
    await refused(await send("PATCH", path, { assignedOn: "2030-01-16" }), "given_after_today");
    await refused(await send("PATCH", path, { assignedOn: day(1) }), "given_after_today");
    const moved = await send("PATCH", path, { assignedOn: day(-3), dueOn: day(-2) });
    expect(moved.status).toBe(200);
    expect(await moved.json()).toMatchObject({ assignedOn: day(-3), dueOn: day(-2) });
    expect((await send("PUT", `${path}/solution`, { note: "Done" })).status).toBe(200);

    // The database refuses a row that breaks it, whatever writes it.
    await expect(
      db.insert(homeworkItems).values({
        childId: ivyId,
        title: "bad",
        assignedOn: day(0),
        dueOn: day(-1),
      }),
    ).rejects.toThrow();

    // The list carries the server's day; the old day-mark route is gone.
    const list = (await (await send("GET", "/api/child/homework")).json()) as { today: unknown };
    expect(list.today).toBe(TODAY);
    expect((await send("PUT", "/api/child/homework-day")).status).toBe(404);
  });

  it("keeps the solution on the item: a note or a photo makes it done, up to 8 solution photos", async () => {
    await turnOn(ivyId);
    asIvy();
    const item = await addItem({ classId: null, title: "Worksheet" });
    const path = `/api/child/homework/${item.id}`;
    const read = async () =>
      (await (await send("GET", path)).json()) as {
        hasSolution: boolean;
        photos: { id: string; kind: string }[];
        solution: {
          note: string | null;
          photos: { id: string; kind: string }[];
          savedAt: string | null;
        };
      };

    let res = await send("PUT", `${path}/solution`, { note: "  Read ch. 6  " });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ hasSolution: true, solution: { note: "Read ch. 6" } });
    expect((await read()).solution.savedAt).not.toBeNull();
    res = await send("PUT", `${path}/solution`, { note: "   " });
    expect(((await res.json()) as { hasSolution: boolean }).hasSolution).toBe(false);
    expect((await send("PUT", `${path}/solution`, { note: "x".repeat(2001) })).status).toBe(400);

    // A photo of the work alone makes it done; sheet and solution photos stay apart.
    expect((await upload(`${path}/photos?kind=answer`, JPEG)).status).toBe(400);
    await upload(`${path}/photos`, JPEG);
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) {
      const up = await upload(`${path}/photos?kind=solution`, JPEG);
      expect(up.status).toBe(201);
      const ref = (await up.json()) as { id: string; kind: string };
      expect(ref.kind).toBe("solution");
      ids.push(ref.id);
    }
    const ninth = await upload(`${path}/photos?kind=solution`, JPEG);
    expect(ninth.status).toBe(409);
    expect(((await ninth.json()) as { code: string }).code).toBe("too_many_photos");
    const now = await read();
    expect(now.hasSolution).toBe(true);
    expect(now.photos.map((p) => p.kind)).toEqual(["sheet"]);
    expect(now.solution.photos.map((p) => p.id)).toEqual(ids);

    // The list counts it as done (it leaves the open groups).
    const list = (await (await send("GET", "/api/child/homework")).json()) as {
      items: { id: string; hasSolution: boolean }[];
    };
    expect(list.items.find((i) => i.id === item.id)?.hasSolution).toBe(true);
  });

  it("first day: anything goes, nothing recorded; after 7 AM: Given on locked, changes recorded, no delete", async () => {
    await turnOn(ivyId);
    asIvy();
    const item = await addItem({
      classId: null,
      title: "Worksheet",
      assignedOn: day(-1),
      dueOn: day(3),
    });
    const path = `/api/child/homework/${item.id}`;
    const history = async () => {
      asParent();
      const res = await send("GET", `/api/homework-items/${item.id}/history`);
      asIvy();
      expect(res.status).toBe(200);
      return (await res.json()) as {
        section: string;
        action: string;
        changes: Record<string, [string | null, string | null]>;
        actorName: string | null;
        photo: { id: string; removed: boolean } | null;
      }[];
    };

    // First day: edit freely, add and delete a photo, change Given on — no history.
    expect(
      (await send("PATCH", path, { title: "Worksheet 2.3", assignedOn: day(-2) })).status,
    ).toBe(200);
    const first = (await (await upload(`${path}/photos`, JPEG)).json()) as { id: string };
    expect((await send("DELETE", `${path}/photos/${first.id}`)).status).toBe(204);
    expect(await history()).toEqual([]);
    expect(
      await db.select().from(homeworkPhotos).where(eq(homeworkPhotos.id, first.id)),
    ).toHaveLength(0);

    // The first day ends at the next 7 AM; move "added" two days back to be past it.
    await db
      .update(homeworkItems)
      .set({ createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000) })
      .where(eq(homeworkItems.id, item.id));

    let res = await send("PATCH", path, { assignedOn: day(-3) });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("given_on_locked");
    // Sending the unchanged Given on (the form always does) is fine.
    res = await send("PATCH", path, { assignedOn: day(-2), dueOn: day(4), title: "Worksheet 2.3" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { edited: boolean }).edited).toBe(true);
    expect((await send("PUT", `${path}/solution`, { note: "Q7 was hard" })).status).toBe(200);
    const work = (await (await upload(`${path}/photos?kind=solution`, JPEG)).json()) as {
      id: string;
    };
    expect((await send("DELETE", `${path}/photos/${work.id}`)).status).toBe(204);

    res = await send("DELETE", path);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("delete_locked");

    // A removed photo leaves the child's view but stays for the parent.
    expect((await send("GET", `${path}/photos/${work.id}`)).status).toBe(404);
    expect(((await (await send("GET", path)).json()) as { hasSolution: boolean }).hasSolution).toBe(
      true,
    );
    asParent();
    expect((await send("GET", `/api/homework-items/${item.id}/photos/${work.id}`)).status).toBe(
      200,
    );
    asIvy();

    const entries = await history();
    expect(entries.map((e) => `${e.section}:${e.action}`)).toEqual([
      "homework:edited",
      "solution:edited",
      "solution:photo_added",
      "solution:photo_removed",
    ]);
    expect(entries[0]?.changes).toEqual({ dueOn: [day(3), day(4)] });
    expect(entries[0]?.actorName).toBe("Ivy");
    expect(entries[1]?.changes).toEqual({ note: [null, "Q7 was hard"] });
    expect(entries[3]?.photo).toMatchObject({ id: work.id, removed: true });

    // The history is the parent's: a child gets refused by path.
    expect((await send("GET", `/api/homework-items/${item.id}/history`)).status).toBe(403);
    // A new item is still in its first day and can be deleted.
    const fresh = await addItem({ classId: null, title: "Duplicate" });
    expect((await send("DELETE", `/api/child/homework/${fresh.id}`)).status).toBe(204);
  });

  it("lists every to-do item and done items due in the last 30 days", async () => {
    await turnOn(ivyId);
    asIvy();
    const due = (offset: number) => ({ assignedOn: day(offset), dueOn: day(offset) });
    const oldTodo = await addItem({ classId: null, title: "old to do", ...due(-60) });
    const oldDone = await addItem({ classId: null, title: "old done", ...due(-60) });
    const recentDone = await addItem({ classId: null, title: "recent done", ...due(-3) });
    await send("PUT", `/api/child/homework/${oldDone.id}/solution`, { note: "Done" });
    await send("PUT", `/api/child/homework/${recentDone.id}/solution`, { note: "Done" });
    const list = (await (await send("GET", "/api/child/homework")).json()) as {
      items: { id: string }[];
    };
    expect(list.items.map((i) => i.id).sort()).toEqual([oldTodo.id, recentDone.id].sort());
  });

  it("lets the parent read but never write a child's items", async () => {
    await turnOn(ivyId);
    asIvy();
    const item = await addItem({ classId: null, title: "Ivy's" });
    asParent();
    expect((await send("POST", "/api/child/homework", { title: "x" })).status).toBe(403);
    expect((await send("PATCH", `/api/child/homework/${item.id}`, { title: "x" })).status).toBe(
      403,
    );
    expect((await send("GET", `/api/children/${ivyId}/homework-items`)).status).toBe(200);
    expect((await send("GET", `/api/homework-items/${item.id}`)).status).toBe(200);
    expect(
      (await send("GET", "/api/homework-items/00000000-0000-4000-8000-000000000999")).status,
    ).toBe(404);
    expect(
      (await send("GET", `/api/children/00000000-0000-4000-8000-000000000999/homework-items`))
        .status,
    ).toBe(404);
  });

  it("offers the current TeacherEase class names (none without a fetch)", async () => {
    asParent();
    const res = await send("GET", `/api/children/${ivyId}/homework-classes/suggestions`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ names: [] });
  });

  it("puts entered items in the digest by given-on day, and stops fetching the homework page", async () => {
    await turnOn(ivyId);
    const [math] = await setClasses(ivyId, [{ name: "Math" }]);
    asIvy();
    await addItem({ classId: math?.id, kind: "test", title: "Ch. 2 test", dueOn: TODAY });
    // Entered today but given yesterday: due today, not today's homework.
    await addItem({ classId: math?.id, title: "Worksheet", assignedOn: day(-1), dueOn: TODAY });

    const digest = await buildDigestFromDb(db, new Date());
    const ivyDigest = digest.children.find((c) => c.childId === ivyId);
    expect(ivyDigest).toMatchObject({ homeworkConfigured: true, homeworkEnteredByChild: true });
    expect(ivyDigest?.homeworkForToday.map((h) => h.subject)).toEqual(["Math · Test"]);
    expect(ivyDigest?.homeworkDueToday.map((h) => h.content)).toEqual(["Ch. 2 test", "Worksheet"]);
    // An item with a solution reads as done.
    const [first] = ivyDigest?.homeworkDueToday ?? [];
    asIvy();
    await send("PUT", `/api/child/homework/${first?.id}/solution`, { note: "Studied" });
    const after = await buildDigestFromDb(db, new Date());
    expect(
      after.children.find((c) => c.childId === ivyId)?.homeworkDueToday.map((h) => h.content),
    ).toEqual(["Ch. 2 test (done)", "Worksheet"]);
    const email = renderDigestEmail(digest);
    expect(email.textBody).not.toContain("marked today");
    const samDigest = digest.children.find((c) => c.childId === samId);
    expect(samDigest?.homeworkEnteredByChild).toBe(false);

    const source = new HomeworkSource(db);
    expect(
      source.isApplicable({ homeworkUrl: "https://hw.example.com", homeworkSource: "child" }),
    ).toBe(false);
    expect(
      source.isApplicable({ homeworkUrl: "https://hw.example.com", homeworkSource: "page" }),
    ).toBe(true);
  });
});
