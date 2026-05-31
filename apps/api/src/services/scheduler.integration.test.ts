// Scheduler cycle integration tests — gated on DATABASE_URL, real Postgres.
// Exercises runFetchCycle / runNotifyCycle with injected deps so no real
// scraping or SMTP happens. Verifies fetch-before-dispatch ordering and the
// email enable/configure gates.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, db } from "../db/index.js";
import { setSetting } from "../db/queries.js";
import { children, settings } from "../db/schema.js";
import { seedSettings } from "../db/seed-settings.js";
import { runFetchCycle, runNotifyCycle } from "./scheduler.js";

const url = process.env.DATABASE_URL;

async function makeChild() {
  const [row] = await db
    .insert(children)
    .values({
      displayName: "Sched Kid",
      baseUrl: "https://x.example.com",
      username: "u@e.com",
      portalPassword: "secret",
      homeworkUrl: null,
    })
    .returning();
  return row!;
}

describe.skipIf(!url)("scheduler cycles (live DB)", () => {
  beforeEach(async () => {
    await db.delete(children);
    await db.delete(settings);
    await seedSettings(db);
  });

  afterAll(async () => {
    await db.delete(children);
    await closeDb();
  });

  it("runFetchCycle calls the fetch impl once per child", async () => {
    await makeChild();
    await makeChild();
    const calls: string[] = [];
    await runFetchCycle(db, { runFetchImpl: async (id) => calls.push(id) });
    expect(calls).toHaveLength(2);
  });

  it("runNotifyCycle fetches before dispatch then skips send when email disabled", async () => {
    await makeChild();
    // notify.fetchBeforeDispatch defaults to "1"; email disabled by default.
    const fetched: string[] = [];
    const sent: unknown[] = [];
    const result = await runNotifyCycle(db, {
      runFetchImpl: async (id) => fetched.push(id),
      sendEmailImpl: async (cfg, content) => {
        sent.push({ cfg, content });
      },
    });
    expect(fetched).toHaveLength(1); // fetch-before-dispatch ran
    expect(result.sent).toBe(false); // email disabled → no send
    expect(sent).toHaveLength(0);
  });

  it("runNotifyCycle sends when email enabled and SMTP configured", async () => {
    await makeChild();
    await setSetting(db, "notify.fetchBeforeDispatch", "0"); // keep it simple
    await setSetting(db, "notify.refreshDigest.email", "1");
    await setSetting(db, "smtp.host", "smtp.example.com");
    await setSetting(db, "smtp.port", "587");
    await setSetting(db, "smtp.username", "u@e.com");
    await setSetting(db, "smtp.from", "from@e.com");
    await setSetting(db, "smtp.to", "to@e.com");
    await setSetting(db, "smtp.password", "secret");

    const sent: { subject: string }[] = [];
    const result = await runNotifyCycle(db, {
      sendEmailImpl: async (_cfg, content) => {
        sent.push({ subject: content.subject });
      },
    });
    expect(result.sent).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toContain("Homework");
  });
});
