// Credentials at rest against the live DB (ADR 0010): what the routes store, what
// the boot step seals, what the fetch and the mailer get back.

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { closeDb, db } from "../db/index.js";
import { children, settings } from "../db/schema.js";
import { seedSettings } from "../db/seed-settings.js";
import { runFetch } from "../fetch/run-fetch.js";
import type { FetchImpl } from "../scraper/types.js";
import { asParent } from "../test/sessions.js";
import { sealStoredCredentials, unsealStoredCredentials } from "./credentials.js";
import { loadSmtpConfig } from "./email.js";

const url = process.env.DATABASE_URL;
const app = createApp({ resolveSession: asParent });

function send(method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function storedPortalPassword(id: string): Promise<string | null> {
  const [row] = await db
    .select({ value: children.portalPassword })
    .from(children)
    .where(eq(children.id, id));
  return row?.value ?? null;
}

async function storedSetting(key: string): Promise<string | undefined> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key));
  return row?.value;
}

describe.skipIf(!url)("credentials at rest (live DB)", () => {
  beforeEach(async () => {
    await db.delete(children);
    await db.delete(settings);
    await seedSettings(db);
  });

  afterAll(async () => {
    await db.delete(children);
    await closeDb();
  });

  it("stores the TeacherEase password sealed and gives the parent the plaintext", async () => {
    const created = await send("POST", "/api/children", {
      displayName: "Ivy",
      baseUrl: "https://x.example.com",
      username: "parent@e.com",
      password: "te-pass-1",
    });
    const { id } = (await created.json()) as { id: string };
    const stored = await storedPortalPassword(id);
    expect(stored?.startsWith("enc:v1:")).toBe(true);
    expect(stored).not.toContain("te-pass-1");
    let res = await send("GET", `/api/children/${id}/password`);
    expect(await res.json()).toEqual({ password: "te-pass-1" });

    await send("PATCH", `/api/children/${id}`, { password: "te-pass-2" });
    expect(await storedPortalPassword(id)).not.toContain("te-pass-2");
    res = await send("GET", `/api/children/${id}/password`);
    expect(await res.json()).toEqual({ password: "te-pass-2" });
  });

  it("stores the SMTP password sealed; the mailer and the settings page read it back", async () => {
    await send("PUT", "/api/settings/smtp.password", { value: "app-password" });
    for (const [key, value] of [
      ["smtp.host", "smtp.example.com"],
      ["smtp.port", "587"],
      ["smtp.username", "me@example.com"],
      ["smtp.from", "me@example.com"],
      ["smtp.to", "me@example.com"],
    ]) {
      await send("PUT", `/api/settings/${key}`, { value });
    }
    expect((await storedSetting("smtp.password"))?.startsWith("enc:v1:")).toBe(true);
    // Only credentials are sealed.
    expect(await storedSetting("smtp.host")).toBe("smtp.example.com");
    const res = await send("GET", "/api/settings/smtp.password");
    expect(await res.json()).toEqual({ key: "smtp.password", value: "app-password" });
    expect((await loadSmtpConfig(db))?.password).toBe("app-password");
  });

  it("seals plaintext left from before on boot, once, and can unseal for a rollback", async () => {
    const [row] = await db
      .insert(children)
      .values({
        displayName: "Old",
        baseUrl: "https://x.example.com",
        username: "u@e.com",
        portalPassword: "legacy-plain",
      })
      .returning({ id: children.id });
    const id = row?.id as string;
    await db
      .update(settings)
      .set({ value: "legacy-smtp" })
      .where(eq(settings.key, "smtp.password"));

    expect(await sealStoredCredentials(db)).toEqual({ sealedNow: 2, stored: 2, unreadable: 0 });
    expect((await storedPortalPassword(id))?.startsWith("enc:v1:")).toBe(true);
    expect((await storedSetting("smtp.password"))?.startsWith("enc:v1:")).toBe(true);
    // Idempotent: nothing left to seal.
    expect(await sealStoredCredentials(db)).toEqual({ sealedNow: 0, stored: 2, unreadable: 0 });

    // A value sealed under another key (or damaged) is reported, not thrown.
    await db
      .update(children)
      .set({ portalPassword: "enc:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" })
      .where(eq(children.id, id));
    expect((await sealStoredCredentials(db)).unreadable).toBe(1);

    // Rollback: everything readable goes back to plaintext.
    await db.update(children).set({ portalPassword: "legacy-plain" }).where(eq(children.id, id));
    await sealStoredCredentials(db);
    expect(await unsealStoredCredentials(db)).toBe(2);
    expect(await storedPortalPassword(id)).toBe("legacy-plain");
    expect(await storedSetting("smtp.password")).toBe("legacy-smtp");
  });

  it("signs in to TeacherEase with the plaintext, never the sealed form", async () => {
    const created = await send("POST", "/api/children", {
      displayName: "Ivy",
      baseUrl: "https://x.example.com",
      username: "parent@e.com",
      password: "te-pass-1",
    });
    const { id } = (await created.json()) as { id: string };
    let loginBody = "";
    const fake = (body: string, status = 200) =>
      ({
        status,
        ok: status < 400,
        url: "https://x.example.com/",
        type: "basic",
        text: async () => body,
        headers: { getSetCookie: () => [] },
      }) as unknown as Response;
    const fetchImpl: FetchImpl = async (input, init) => {
      const s = input.toString();
      if (s.includes("/common/login.aspx")) return fake("<form></form>");
      if (s.includes("/app/Login/Login")) {
        loginBody = String(init?.body ?? "");
        return fake("", 302);
      }
      return fake("not found", 404);
    };
    await runFetch(id, { db, fetchImpl });
    expect(loginBody).toContain("te-pass-1");
    expect(loginBody).not.toContain("enc%3Av1");
    expect(loginBody).not.toContain("enc:v1");
  });
});
