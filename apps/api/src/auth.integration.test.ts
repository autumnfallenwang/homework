// Logins end to end on live Postgres (ADR 0004): the REAL Better Auth session
// path, cookies and all. Gated on DATABASE_URL like the other integration tests.

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { closeDb, db } from "./db/index.js";
import { children, invites, users } from "./db/schema.js";
import { seedSettings } from "./db/seed-settings.js";
import { acceptInvite, InviteError, issueInvite, previewInvite } from "./services/invites.js";

const url = process.env.DATABASE_URL;
const app = createApp({ rateLimit: false });

/** A browser: remembers the session cookie across requests. */
function browser() {
  let cookie = "";
  return async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        origin: "http://localhost:3000",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.getSetCookie().map((c) => c.split(";")[0]);
    if (set.length) cookie = set.join("; ");
    return res;
  };
}

const PARENT = { name: "Parent", email: "parent@example.com", password: "parent-password-1" };

async function signUpParent() {
  const parent = browser();
  const res = await parent("POST", "/api/auth/sign-up/email", PARENT);
  expect(res.status).toBe(200);
  return parent;
}

async function addChild(parent: ReturnType<typeof browser>, displayName = "Ivy") {
  const res = await parent("POST", "/api/children", {
    displayName,
    baseUrl: "https://te.example.com",
    username: "parent-te-login",
    password: "te-secret",
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function issue(parent: ReturnType<typeof browser>, childId: string, purpose: string) {
  const res = await parent("POST", `/api/children/${childId}/invites`, { purpose });
  return { status: res.status, body: (await res.json()) as { token: string; path: string } };
}

describe.skipIf(!url)("logins (live DB)", () => {
  beforeEach(async () => {
    await db.delete(users); // sessions + accounts cascade
    await db.delete(children); // invites cascade
    await seedSettings(db);
  });

  afterAll(async () => {
    await db.delete(users);
    await db.delete(children);
    await closeDb();
  });

  it("★ the first sign-up becomes the parent; then sign-up is closed", async () => {
    const anyone = browser();
    expect(await (await anyone("GET", "/api/public/setup-state")).json()).toEqual({
      needsFirstParent: true,
    });
    const parent = await signUpParent();
    const me = await (await parent("GET", "/api/me")).json();
    expect(me).toMatchObject({ user: { role: "parent", email: PARENT.email }, child: null });
    expect(await (await anyone("GET", "/api/public/setup-state")).json()).toEqual({
      needsFirstParent: false,
    });

    const second = await browser()("POST", "/api/auth/sign-up/email", {
      name: "Stranger",
      email: "stranger@example.com",
      password: "stranger-password",
    });
    expect(second.status).toBe(403);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("★ invite → child picks username + password → signs in → sees only her own area", async () => {
    const parent = await signUpParent();
    const ivy = await addChild(parent, "Ivy");
    expect(await (await parent("GET", `/api/children/${ivy}/login`)).json()).toEqual({
      login: null,
      invite: null,
    });
    expect((await issue(parent, ivy, "reset")).status).toBe(409); // nothing to reset yet

    const { status, body } = await issue(parent, ivy, "join");
    expect(status).toBe(201);
    expect(body.path).toBe(`/join/${body.token}`);
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 random bytes
    const stored = await db.select().from(invites).where(eq(invites.childId, ivy));
    expect(stored[0]?.tokenHash).not.toBe(body.token); // only the hash is kept
    expect(
      ((await (await parent("GET", `/api/children/${ivy}/login`)).json()) as { invite: unknown })
        .invite,
    ).toMatchObject({ purpose: "join" });

    const child = browser();
    expect(await (await child("GET", `/api/public/invites/${body.token}`)).json()).toMatchObject({
      status: "valid",
      purpose: "join",
      childName: "Ivy",
    });
    const accepted = await child("POST", `/api/public/invites/${body.token}/accept`, {
      username: "Ivy_1",
      password: "child-password-1",
    });
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ username: "ivy_1" });

    // Used up.
    const again = await browser()("POST", `/api/public/invites/${body.token}/accept`, {
      username: "other",
      password: "child-password-1",
    });
    expect(again.status).toBe(410);

    // Sign-in by username is case-insensitive.
    const signIn = await child("POST", "/api/auth/sign-in/username", {
      username: "IVY_1",
      password: "child-password-1",
    });
    expect(signIn.status).toBe(200);
    expect(await (await child("GET", "/api/me")).json()).toMatchObject({
      user: { role: "child", username: "ivy_1" },
      child: { id: ivy, displayName: "Ivy" },
    });
    expect(await (await child("GET", "/api/child/profile")).json()).toEqual({
      displayName: "Ivy",
      grade: null,
      school: null,
    });

    // The child never reaches the parent's API — least of all the TeacherEase password.
    for (const path of ["/api/children", `/api/children/${ivy}/password`, "/api/settings/x"]) {
      expect((await child("GET", path)).status).toBe(403);
    }
    // …and the parent never lands in the child's API.
    expect((await parent("GET", "/api/child/profile")).status).toBe(403);
    // The parent's card shows her login.
    expect(await (await parent("GET", `/api/children/${ivy}/login`)).json()).toMatchObject({
      login: { username: "Ivy_1" },
      invite: null,
    });
  });

  it("★ a child cannot promote herself or move to another profile", async () => {
    const parent = await signUpParent();
    const ivy = await addChild(parent, "Ivy");
    const other = await addChild(parent, "Other");
    const { body } = await issue(parent, ivy, "join");
    const child = browser();
    await child("POST", `/api/public/invites/${body.token}/accept`, {
      username: "ivy",
      password: "child-password-1",
    });
    await child("POST", "/api/auth/sign-in/username", {
      username: "ivy",
      password: "child-password-1",
    });

    await child("POST", "/api/auth/update-user", { role: "parent", childId: other });
    const [row] = await db.select().from(users).where(eq(users.username, "ivy"));
    expect(row).toMatchObject({ role: "child", childId: ivy });
    expect((await child("GET", "/api/children")).status).toBe(403);
  });

  it("★ a reset link sets a new password and signs her out everywhere", async () => {
    const parent = await signUpParent();
    const ivy = await addChild(parent);
    const join = await issue(parent, ivy, "join");
    const child = browser();
    await child("POST", `/api/public/invites/${join.body.token}/accept`, {
      username: "ivy",
      password: "old-password-1",
    });
    await child("POST", "/api/auth/sign-in/username", {
      username: "ivy",
      password: "old-password-1",
    });
    expect((await child("GET", "/api/me")).status).toBe(200);

    const reset = await issue(parent, ivy, "reset");
    expect(reset.status).toBe(201);
    expect(
      await (await browser()("GET", `/api/public/invites/${reset.body.token}`)).json(),
    ).toMatchObject({ status: "valid", purpose: "reset", username: "ivy" });
    const done = await browser()("POST", `/api/public/invites/${reset.body.token}/accept`, {
      password: "new-password-1",
    });
    expect(await done.json()).toEqual({ username: "ivy" });

    expect((await child("GET", "/api/me")).status).toBe(401); // old session ended
    const old = await browser()("POST", "/api/auth/sign-in/username", {
      username: "ivy",
      password: "old-password-1",
    });
    expect(old.status).toBe(401);
    const fresh = await browser()("POST", "/api/auth/sign-in/username", {
      username: "ivy",
      password: "new-password-1",
    });
    expect(fresh.status).toBe(200);
  });

  it("remove login keeps the profile; deleting the profile removes its login", async () => {
    const parent = await signUpParent();
    const ivy = await addChild(parent);
    const first = await issue(parent, ivy, "join");
    await browser()("POST", `/api/public/invites/${first.body.token}/accept`, {
      username: "ivy",
      password: "child-password-1",
    });
    expect((await parent("DELETE", `/api/children/${ivy}/login`)).status).toBe(204);
    expect(await db.select().from(users).where(eq(users.childId, ivy))).toHaveLength(0);
    expect(await db.select().from(children).where(eq(children.id, ivy))).toHaveLength(1);
    expect((await parent("DELETE", `/api/children/${ivy}/login`)).status).toBe(404);

    const second = await issue(parent, ivy, "join");
    await browser()("POST", `/api/public/invites/${second.body.token}/accept`, {
      username: "ivy",
      password: "child-password-1",
    });
    expect(await db.select().from(users).where(eq(users.childId, ivy))).toHaveLength(1);
    expect((await parent("DELETE", `/api/children/${ivy}`)).status).toBe(204);
    expect(await db.select().from(users).where(eq(users.username, "ivy"))).toHaveLength(0);
  });

  it("one login per profile; a new link cancels the old one; expired links are refused", async () => {
    const parent = await signUpParent();
    const ivy = await addChild(parent);
    const old = await issue(parent, ivy, "join");
    const fresh = await issue(parent, ivy, "join");
    expect(await previewInvite(db, old.body.token)).toEqual({ status: "invalid" });
    expect((await previewInvite(db, fresh.body.token)).status).toBe("valid");

    await acceptInvite(db, fresh.body.token, { username: "ivy", password: "child-password-1" });
    expect((await issue(parent, ivy, "join")).status).toBe(409); // already has a login

    const [child] = await db.select().from(children).where(eq(children.id, ivy));
    const past = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const stale = await issueInvite(
      db,
      { childId: child!.id, purpose: "reset", createdBy: null },
      past,
    );
    expect(await previewInvite(db, stale.token)).toEqual({ status: "expired" });
    await expect(acceptInvite(db, stale.token, { password: "whatever-1" })).rejects.toMatchObject({
      code: "expired",
    });
    await expect(
      acceptInvite(db, "no-such-token", { password: "whatever-1" }),
    ).rejects.toBeInstanceOf(InviteError);
  });

  it("★ a taken username releases the link for another try; two tabs → one login", async () => {
    const parent = await signUpParent();
    const ivy = await addChild(parent, "Ivy");
    const sam = await addChild(parent, "Sam");
    const samLink = await issue(parent, sam, "join");
    await acceptInvite(db, samLink.body.token, { username: "sam", password: "child-password-1" });

    const ivyLink = await issue(parent, ivy, "join");
    await expect(
      acceptInvite(db, ivyLink.body.token, { username: "SAM", password: "child-password-1" }),
    ).rejects.toMatchObject({ code: "username_taken" });
    // Same link, new name: it still works.
    await expect(
      acceptInvite(db, ivyLink.body.token, { username: "ivy", password: "child-password-1" }),
    ).resolves.toEqual({ username: "ivy" });

    // Race: one link, two simultaneous accepts.
    await db.delete(users).where(eq(users.childId, ivy));
    const race = await issue(parent, ivy, "join");
    const results = await Promise.allSettled([
      acceptInvite(db, race.body.token, { username: "ivy_a", password: "child-password-1" }),
      acceptInvite(db, race.body.token, { username: "ivy_b", password: "child-password-1" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.select().from(users).where(eq(users.childId, ivy))).toHaveLength(1);
  });

  it("the database refuses a child with no profile", async () => {
    await expect(
      db.insert(users).values({ name: "x", email: "x@homework.invalid", role: "child" }),
    ).rejects.toThrow();
  });

  it("sign-out ends the session", async () => {
    const parent = await signUpParent();
    expect((await parent("GET", "/api/me")).status).toBe(200);
    expect((await parent("POST", "/api/auth/sign-out", {})).status).toBe(200);
    expect((await parent("GET", "/api/me")).status).toBe(401);
  });
});
