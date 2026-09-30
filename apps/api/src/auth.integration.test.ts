// Logins end to end on live Postgres (ADR 0004, ADR 0005): the REAL Better Auth
// session path, cookies and all. Every login is the same shape — name, email,
// password, role — and signs in with its email. Gated on DATABASE_URL like the
// other integration tests.

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
type Browser = ReturnType<typeof browser>;

const PARENT = { name: "Parent", email: "parent@example.com", password: "parent-password-1" };

async function signUpParent() {
  const parent = browser();
  const res = await parent("POST", "/api/auth/sign-up/email", PARENT);
  expect(res.status).toBe(200);
  return parent;
}

async function signIn(who: Browser, email: string, password: string) {
  return who("POST", "/api/auth/sign-in/email", { email, password });
}

async function addChild(parent: Browser, displayName = "Ivy") {
  const res = await parent("POST", "/api/children", {
    displayName,
    baseUrl: "https://te.example.com",
    username: "parent-te-login", // the TeacherEase portal login, not a login of ours
    password: "te-secret",
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function issue(parent: Browser, childId: string, purpose: string) {
  const res = await parent("POST", `/api/children/${childId}/invites`, { purpose });
  return { status: res.status, body: (await res.json()) as { token: string; path: string } };
}

/** A child profile with a signed-in child login. */
async function childSignedIn(
  parent: Browser,
  email = "ivy@example.com",
  password = "child-pass-123",
) {
  const ivy = await addChild(parent, "Ivy");
  const { body } = await issue(parent, ivy, "join");
  const accepted = await browser()("POST", `/api/public/invites/${body.token}/accept`, {
    email,
    password,
  });
  expect(accepted.status).toBe(200);
  const child = browser();
  expect((await signIn(child, email, password)).status).toBe(200);
  return { ivy, child };
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
    expect(me).toEqual({
      user: { id: expect.any(String), name: "Parent", email: PARENT.email, role: "parent" },
      child: null,
    });
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

  it("★ invite → child gives email + password → signs in with email → sees only their area", async () => {
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

    const child = browser();
    expect(await (await child("GET", `/api/public/invites/${body.token}`)).json()).toMatchObject({
      status: "valid",
      purpose: "join",
      childName: "Ivy",
      email: null,
    });
    // A join needs an email.
    const noEmail = await child("POST", `/api/public/invites/${body.token}/accept`, {
      password: "child-pass-123",
    });
    expect(noEmail.status).toBe(400);
    const accepted = await child("POST", `/api/public/invites/${body.token}/accept`, {
      email: " Ivy@Example.com ",
      password: "child-pass-123",
    });
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ email: "ivy@example.com" });

    // Used up.
    const again = await browser()("POST", `/api/public/invites/${body.token}/accept`, {
      email: "other@example.com",
      password: "child-pass-123",
    });
    expect(again.status).toBe(410);

    // Sign-in by email, case-insensitive.
    expect((await signIn(child, "IVY@example.com", "child-pass-123")).status).toBe(200);
    expect(await (await child("GET", "/api/me")).json()).toMatchObject({
      user: { role: "child", email: "ivy@example.com", name: "Ivy" },
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
    // The parent's card shows the child login's email.
    expect(await (await parent("GET", `/api/children/${ivy}/login`)).json()).toMatchObject({
      login: { email: "ivy@example.com" },
      invite: null,
    });
  });

  it("★ an email already used by another login is refused, and the link survives for a retry", async () => {
    const parent = await signUpParent();
    const ivy = await addChild(parent, "Ivy");
    const { body } = await issue(parent, ivy, "join");
    const taken = await browser()("POST", `/api/public/invites/${body.token}/accept`, {
      email: PARENT.email,
      password: "child-pass-123",
    });
    expect(taken.status).toBe(409);
    const retry = await browser()("POST", `/api/public/invites/${body.token}/accept`, {
      email: "ivy@example.com",
      password: "child-pass-123",
    });
    expect(retry.status).toBe(200);
  });

  it("★ Better Auth's own update-user / change-email are closed — PATCH /api/me is the door", async () => {
    const parent = await signUpParent();
    const { ivy, child } = await childSignedIn(parent);
    const other = await addChild(parent, "Other");
    for (const who of [parent, child]) {
      expect((await who("POST", "/api/auth/update-user", { name: "X" })).status).toBe(404);
      expect(
        (await who("POST", "/api/auth/change-email", { newEmail: "x@example.com" })).status,
      ).toBe(404);
    }
    // A child cannot promote themselves or move to another profile by any route.
    await child("PATCH", "/api/me", { role: "parent", childId: other });
    const [row] = await db.select().from(users).where(eq(users.childId, ivy));
    expect(row).toMatchObject({ role: "child", childId: ivy });
    expect((await child("GET", "/api/children")).status).toBe(403);
  });

  it("★ Account: a parent changes name and email; a child changes email, never their name", async () => {
    const parent = await signUpParent();
    const { ivy, child } = await childSignedIn(parent);

    expect((await parent("PATCH", "/api/me", { name: "Aaron" })).status).toBe(200);
    expect((await parent("PATCH", "/api/me", { email: "aaron@example.com" })).status).toBe(200);
    expect(await (await parent("GET", "/api/me")).json()).toMatchObject({
      user: { name: "Aaron", email: "aaron@example.com", role: "parent" },
    });
    // The new email is the new sign-in.
    expect((await signIn(browser(), "aaron@example.com", PARENT.password)).status).toBe(200);
    expect((await signIn(browser(), PARENT.email, PARENT.password)).status).toBe(401);

    // A child's name belongs to the profile.
    expect((await child("PATCH", "/api/me", { name: "Queen Ivy" })).status).toBe(403);
    // Their email is theirs — but not one another login uses.
    expect((await child("PATCH", "/api/me", { email: "aaron@example.com" })).status).toBe(409);
    expect((await child("PATCH", "/api/me", { email: "ivy.new@example.com" })).status).toBe(200);
    expect((await child("PATCH", "/api/me", { email: "not-an-email" })).status).toBe(400);

    // The profile owns the name: renaming it renames the child login, one way.
    const rename = await parent("PATCH", `/api/children/${ivy}`, {
      displayName: "Ivy B.",
      username: "parent-te-login",
    });
    expect(rename.status).toBe(200);
    expect(await (await child("GET", "/api/me")).json()).toMatchObject({
      user: { name: "Ivy B.", email: "ivy.new@example.com", role: "child" },
    });
  });

  it("★ a reset link sets a new password and signs them out everywhere", async () => {
    const parent = await signUpParent();
    const { ivy, child } = await childSignedIn(parent, "ivy@example.com", "old-password-1");
    expect((await child("GET", "/api/me")).status).toBe(200);

    const reset = await issue(parent, ivy, "reset");
    expect(reset.status).toBe(201);
    expect(
      await (await browser()("GET", `/api/public/invites/${reset.body.token}`)).json(),
    ).toMatchObject({ status: "valid", purpose: "reset", email: "ivy@example.com" });
    const done = await browser()("POST", `/api/public/invites/${reset.body.token}/accept`, {
      password: "new-password-1",
    });
    expect(await done.json()).toEqual({ email: "ivy@example.com" });

    expect((await child("GET", "/api/me")).status).toBe(401); // old session ended
    expect((await signIn(browser(), "ivy@example.com", "old-password-1")).status).toBe(401);
    expect((await signIn(browser(), "ivy@example.com", "new-password-1")).status).toBe(200);
  });

  it("★ Account: changing your own password signs out your other devices", async () => {
    const parent = await signUpParent();
    await childSignedIn(parent, "ivy@example.com", "first-password-1");
    const phone = browser();
    const laptop = browser();
    for (const device of [phone, laptop]) {
      expect((await signIn(device, "ivy@example.com", "first-password-1")).status).toBe(200);
    }
    const wrong = await laptop("POST", "/api/auth/change-password", {
      currentPassword: "not-my-password",
      newPassword: "second-password-2",
      revokeOtherSessions: true,
    });
    expect(wrong.status).not.toBe(200);
    const ok = await laptop("POST", "/api/auth/change-password", {
      currentPassword: "first-password-1",
      newPassword: "second-password-2",
      revokeOtherSessions: true,
    });
    expect(ok.status).toBe(200);
    expect((await laptop("GET", "/api/me")).status).toBe(200); // this device stays in
    expect((await phone("GET", "/api/me")).status).toBe(401); // the other one is out
    expect((await signIn(browser(), "ivy@example.com", "second-password-2")).status).toBe(200);
  });

  it("remove login keeps the profile; deleting the profile removes its login", async () => {
    const parent = await signUpParent();
    const { ivy } = await childSignedIn(parent);
    expect((await parent("DELETE", `/api/children/${ivy}/login`)).status).toBe(204);
    expect(await db.select().from(users).where(eq(users.childId, ivy))).toHaveLength(0);
    expect(await db.select().from(children).where(eq(children.id, ivy))).toHaveLength(1);
    expect((await parent("DELETE", `/api/children/${ivy}/login`)).status).toBe(404);

    const again = await issue(parent, ivy, "join");
    await acceptInvite(db, again.body.token, {
      email: "ivy@example.com",
      password: "child-pass-123",
    });
    expect(await db.select().from(users).where(eq(users.childId, ivy))).toHaveLength(1);
    expect((await parent("DELETE", `/api/children/${ivy}`)).status).toBe(204);
    expect(await db.select().from(users).where(eq(users.email, "ivy@example.com"))).toHaveLength(0);
  });

  it("one login per profile; a new link cancels the old one; expired links are refused", async () => {
    const parent = await signUpParent();
    const ivy = await addChild(parent);
    const old = await issue(parent, ivy, "join");
    const fresh = await issue(parent, ivy, "join");
    expect(await previewInvite(db, old.body.token)).toEqual({ status: "invalid" });
    expect((await previewInvite(db, fresh.body.token)).status).toBe("valid");

    await acceptInvite(db, fresh.body.token, {
      email: "ivy@example.com",
      password: "child-pass-123",
    });
    expect((await issue(parent, ivy, "join")).status).toBe(409); // already has a login

    const past = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const stale = await issueInvite(db, { childId: ivy, purpose: "reset", createdBy: null }, past);
    expect(await previewInvite(db, stale.token)).toEqual({ status: "expired" });
    await expect(acceptInvite(db, stale.token, { password: "whatever-1" })).rejects.toMatchObject({
      code: "expired",
    });
    await expect(
      acceptInvite(db, "no-such-token", { password: "whatever-1" }),
    ).rejects.toBeInstanceOf(InviteError);
  });

  it("★ two tabs racing on one link → one login", async () => {
    const parent = await signUpParent();
    const ivy = await addChild(parent, "Ivy");
    const race = await issue(parent, ivy, "join");
    const results = await Promise.allSettled([
      acceptInvite(db, race.body.token, { email: "ivy.a@example.com", password: "child-pass-123" }),
      acceptInvite(db, race.body.token, { email: "ivy.b@example.com", password: "child-pass-123" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.select().from(users).where(eq(users.childId, ivy))).toHaveLength(1);
  });

  it("the database refuses a child login with no profile", async () => {
    await expect(
      db.insert(users).values({ name: "x", email: "x@example.com", role: "child" }),
    ).rejects.toThrow();
  });

  it("sign-out ends the session", async () => {
    const parent = await signUpParent();
    expect((await parent("GET", "/api/me")).status).toBe(200);
    expect((await parent("POST", "/api/auth/sign-out", {})).status).toBe(200);
    expect((await parent("GET", "/api/me")).status).toBe(401);
  });
});
