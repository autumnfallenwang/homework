// Credentials at rest, whole-table work (ADR 0010): seal any plaintext left from
// before ADR 0010 (run on every boot — idempotent), check every sealed value
// opens with this process's key, and unseal everything for a rollback.

import { and, eq, inArray, isNotNull, like, not } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { children, settings } from "../db/schema.js";
import {
  CREDENTIAL_SETTING_KEYS,
  isSealed,
  openCredential,
  sealCredential,
} from "../lib/credentials.js";

const SEALED = "enc:v1:%";
const settingKeys = [...CREDENTIAL_SETTING_KEYS];

export interface CredentialsReport {
  /** Plaintext values sealed by this call. */
  sealedNow: number;
  /** Stored credentials (non-empty) after sealing. */
  stored: number;
  /** Stored values this process cannot open (wrong key, damaged). */
  unreadable: number;
}

async function storedCredentials(db: Database) {
  const portal = await db
    .select({ id: children.id, value: children.portalPassword })
    .from(children)
    .where(isNotNull(children.portalPassword));
  const smtp = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, settingKeys));
  return {
    portal: portal.filter((r): r is { id: string; value: string } => Boolean(r.value)),
    smtp: smtp.filter((r) => r.value !== ""),
  };
}

/** Seal every plaintext credential, then count what is stored and what cannot be opened. */
export async function sealStoredCredentials(db: Database): Promise<CredentialsReport> {
  let sealedNow = 0;
  await db.transaction(async (tx) => {
    const portal = await tx
      .select({ id: children.id, value: children.portalPassword })
      .from(children)
      .where(and(isNotNull(children.portalPassword), not(like(children.portalPassword, SEALED))));
    for (const row of portal) {
      if (!row.value) continue;
      await tx
        .update(children)
        .set({ portalPassword: sealCredential(row.value) })
        .where(eq(children.id, row.id));
      sealedNow += 1;
    }
    const smtp = await tx
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(and(inArray(settings.key, settingKeys), not(like(settings.value, SEALED))));
    for (const row of smtp) {
      if (row.value === "") continue;
      await tx
        .update(settings)
        .set({ value: sealCredential(row.value), updatedAt: new Date() })
        .where(eq(settings.key, row.key));
      sealedNow += 1;
    }
  });

  const { portal, smtp } = await storedCredentials(db);
  const values = [...portal, ...smtp].map((r) => r.value);
  let unreadable = 0;
  for (const value of values) {
    try {
      openCredential(value);
    } catch {
      unreadable += 1;
    }
  }
  return { sealedNow, stored: values.length, unreadable };
}

/**
 * Write every credential back as plaintext — only for running an image from
 * before ADR 0010, or before rotating BETTER_AUTH_SECRET. The next boot of a
 * current image seals them again.
 */
export async function unsealStoredCredentials(db: Database): Promise<number> {
  let count = 0;
  await db.transaction(async (tx) => {
    const portal = await tx
      .select({ id: children.id, value: children.portalPassword })
      .from(children)
      .where(like(children.portalPassword, SEALED));
    for (const row of portal) {
      if (!row.value || !isSealed(row.value)) continue;
      await tx
        .update(children)
        .set({ portalPassword: openCredential(row.value) })
        .where(eq(children.id, row.id));
      count += 1;
    }
    const smtp = await tx
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(and(inArray(settings.key, settingKeys), like(settings.value, SEALED)));
    for (const row of smtp) {
      await tx
        .update(settings)
        .set({ value: openCredential(row.value), updatedAt: new Date() })
        .where(eq(settings.key, row.key));
      count += 1;
    }
  });
  return count;
}
