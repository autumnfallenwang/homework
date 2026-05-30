import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "./schema.js";
import { children, fetchRuns, grades, settings } from "./schema.js";
import { seedSettings } from "./seed-settings.js";

// Gated integration test — requires a live Postgres with the schema migrated.
// Run locally with: DATABASE_URL=... pnpm --filter @homework/api exec vitest run src/db/schema.integration.test.ts
// Excluded from test:fast so CI without a DB stays green.
const url = process.env.DATABASE_URL;
const client = postgres(url ?? "postgres://invalid");
const db = drizzle(client, { schema });

describe.skipIf(!url)("schema integration (live DB)", () => {
  beforeAll(async () => {
    await db.delete(children); // cascade clears fetch_runs/grades
  });

  afterAll(async () => {
    await db.delete(children);
    await client.end();
  });

  it("seeds default settings idempotently", async () => {
    await seedSettings(db);
    await seedSettings(db); // second run must not error or duplicate
    const rows = await db.select().from(settings).where(eq(settings.key, "fetch.runsPerDay"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe("3");
  });

  it("inserts a child → fetchRun → grade and reads it back", async () => {
    const [child] = await db
      .insert(children)
      .values({ displayName: "Test Kid", baseUrl: "https://x.example.com", username: "u@e.com" })
      .returning();
    expect(child?.id).toBeTruthy();

    const [run] = await db
      .insert(fetchRuns)
      .values({ childId: child!.id, status: "success" })
      .returning();
    expect(run?.id).toBeTruthy();

    await db.insert(grades).values({ fetchRunId: run!.id, className: "Math", status: "meeting" });

    const got = await db.select().from(grades).where(eq(grades.fetchRunId, run!.id));
    expect(got).toHaveLength(1);
    expect(got[0]?.className).toBe("Math");
  });

  it("cascades deletes from children down to fetch_runs", async () => {
    const [child] = await db
      .insert(children)
      .values({ displayName: "Cascade Kid", baseUrl: "https://y.example.com", username: "c@e.com" })
      .returning();
    await db.insert(fetchRuns).values({ childId: child!.id, status: "success" });

    await db.delete(children).where(eq(children.id, child!.id));

    const orphans = await db.select().from(fetchRuns).where(eq(fetchRuns.childId, child!.id));
    expect(orphans).toHaveLength(0);
  });
});
