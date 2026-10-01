// Child-entered homework (ADR 0006) end to end on the live Postgres: the
// switch, the parent-owned class list, the child's items and photos, the day,
// what the parent reads, the digest, and who can touch whose rows.

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { closeDb, db } from "../db/index.js";
import { children, homeworkPhotos, users } from "../db/schema.js";
import { seedSettings } from "../db/seed-settings.js";
import { HomeworkSource } from "../fetch/homework-source.js";
import type { SessionUser } from "../middleware/auth.js";
import { buildDigestFromDb, renderDigestEmail, toLocalIso } from "../services/digest.js";
import { PARENT } from "../test/sessions.js";

const url = process.env.DATABASE_URL;

let session: SessionUser | null = null;
const app = createApp({ resolveSession: async () => session });

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);

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
    await db.delete(children); // cascades to logins, classes, items, photos, days
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
      assignedOn: toLocalIso(new Date()),
      status: "todo",
      createdByName: "Ivy",
      photos: [],
    });

    // Off again: the list stays readable, writes stop.
    asParent();
    await send("PATCH", `/api/children/${ivyId}`, { homeworkSource: "page" });
    asIvy();
    expect((await send("PATCH", `/api/child/homework/${item.id}`, { status: "done" })).status).toBe(
      403,
    );
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
      dueOn: "2030-01-15",
    });
    expect(archived.status).toBe(400);

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
      dueOn: "2030-01-15",
    });
    expect(cross.status).toBe(400);
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

  it("edits, ticks done and deletes an item", async () => {
    await turnOn(ivyId);
    const [math] = await setClasses(ivyId, [{ name: "Math" }]);
    asIvy();
    const item = await addItem({ classId: math?.id, title: "Worksheet 2.3", details: "  " });
    expect(item.details).toBeNull();

    let res = await send("PATCH", `/api/child/homework/${item.id}`, {
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

    res = await send("PATCH", `/api/child/homework/${item.id}`, { status: "done" });
    const done = (await res.json()) as { status: string; completedAt: string | null };
    expect(done.status).toBe("done");
    expect(done.completedAt).not.toBeNull();
    res = await send("PATCH", `/api/child/homework/${item.id}`, { status: "todo" });
    expect(((await res.json()) as { completedAt: string | null }).completedAt).toBeNull();

    for (const bad of [{}, { title: "" }, { dueOn: "2030-02-30" }, { kind: "essay" }]) {
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

  it("records that's-everything-for-today and shows it to the parent", async () => {
    await turnOn(ivyId);
    asIvy();
    let res = await send("PUT", "/api/child/homework-day");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { completedAt: string | null }).completedAt).not.toBeNull();
    // Marking twice is harmless.
    expect((await send("PUT", "/api/child/homework-day")).status).toBe(200);

    asParent();
    const list = (await (await send("GET", `/api/children/${ivyId}/homework-items`)).json()) as {
      today: { date: string; completedAt: string | null };
    };
    expect(list.today.date).toBe(toLocalIso(new Date()));
    expect(list.today.completedAt).not.toBeNull();

    asIvy();
    res = await send("DELETE", "/api/child/homework-day");
    expect(((await res.json()) as { completedAt: string | null }).completedAt).toBeNull();
  });

  it("lists every to-do item and done items due in the last 30 days", async () => {
    await turnOn(ivyId);
    asIvy();
    const today = toLocalIso(new Date());
    const day = (offset: number) => {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + offset);
      return d.toISOString().slice(0, 10);
    };
    const oldTodo = await addItem({ classId: null, title: "old to do", dueOn: day(-60) });
    const oldDone = await addItem({ classId: null, title: "old done", dueOn: day(-60) });
    const recentDone = await addItem({ classId: null, title: "recent done", dueOn: day(-3) });
    await send("PATCH", `/api/child/homework/${oldDone.id}`, { status: "done" });
    await send("PATCH", `/api/child/homework/${recentDone.id}`, { status: "done" });
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

  it("puts entered items and the day in the digest, and stops fetching the homework page", async () => {
    await turnOn(ivyId);
    const [math] = await setClasses(ivyId, [{ name: "Math" }]);
    asIvy();
    const today = toLocalIso(new Date());
    await addItem({ classId: math?.id, kind: "test", title: "Ch. 2 test", dueOn: today });
    await send("PUT", "/api/child/homework-day");

    const digest = await buildDigestFromDb(db, new Date());
    const ivyDigest = digest.children.find((c) => c.childId === ivyId);
    expect(ivyDigest).toMatchObject({
      homeworkConfigured: true,
      homeworkEnteredByChild: true,
      homeworkDayComplete: true,
    });
    expect(ivyDigest?.homeworkForToday.map((h) => h.subject)).toEqual(["Math · Test"]);
    expect(ivyDigest?.homeworkDueToday.map((h) => h.content)).toEqual(["Ch. 2 test"]);
    const email = renderDigestEmail(digest);
    expect(email.textBody).toContain("Ivy marked today's homework complete.");
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
