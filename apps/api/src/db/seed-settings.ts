import { fileURLToPath } from "node:url";
import { log } from "../lib/logger.js";
import type { Database } from "./index.js";
import { settings } from "./schema.js";

// Default settings the desktop app relied on (from migrations.rs + the M02
// milestone doc). Stored as strings to match the source's KV semantics; bool
// flags are "0"/"1". Desktop-only keys (notify.refreshDigest.os, autostart,
// updater, appearance) are dropped per the M05/M06 feature cuts.
export const DEFAULT_SETTINGS: Record<string, string> = {
  "attention.forgivenessWeeks": "2",
  "attention.lowScoreThreshold": "3.0",
  "fetch.runsPerDay": "3",
  "fetch.firstSlotAt": "09:00",
  "fetch.weekdaysOnly": "0",
  "notify.runsPerDay": "2",
  "notify.firstSlotAt": "08:00",
  "notify.weekdaysOnly": "0",
  "notify.fetchBeforeDispatch": "1",
  "notify.catchupOnMiss": "1",
  "notify.refreshDigest.email": "0",
  "smtp.host": "",
  "smtp.port": "",
  "smtp.username": "",
  "smtp.from": "",
  "smtp.to": "",
  "smtp.password": "",
};

/** Idempotently insert default settings rows. Existing keys are left untouched. */
export async function seedSettings(db: Database): Promise<void> {
  const rows = Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value }));
  await db.insert(settings).values(rows).onConflictDoNothing({ target: settings.key });
}

// CLI entry: `tsx --env-file=.env src/db/seed-settings.ts`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { db } = await import("./index.js");
  await seedSettings(db);
  log.info(
    { event: "seed.settings.done", count: Object.keys(DEFAULT_SETTINGS).length },
    "default settings seeded",
  );
  process.exit(0);
}
