// Top-level fetch entrypoint. Loads a child from the DB, builds the Node fetch
// transport, runs the TeacherEase + homework sources through the FetchRunner
// (which owns the fetch_runs lifecycle + persistence), and returns a summary.
// This is the internal function M04's API + M05's scheduler will call.

import { eq } from "drizzle-orm";
import { type Database, db as defaultDb } from "../db/index.js";
import { children } from "../db/schema.js";
import { createNodeFetch } from "../scraper/transport.js";
import type { ChildRecord, FetchImpl } from "../scraper/types.js";
import { HomeworkSource } from "./homework-source.js";
import { completeFetchRun, startFetchRun } from "./persist.js";
import { FetchRunner } from "./runner.js";
import { TeacherEaseSource } from "./teacherease-source.js";
import type { FetchRunnerDeps, FetchRunnerSummary } from "./types.js";

export interface RunFetchOptions {
  /** Override the DB (tests). Defaults to the app singleton. */
  readonly db?: Database;
  /** Override the transport (tests inject a fake serving fixture HTML). */
  readonly fetchImpl?: FetchImpl;
  /** Override the password lookup (tests). Defaults to reading the child row. */
  readonly getPassword?: (childId: string) => Promise<string | null>;
}

function toChildRecord(row: typeof children.$inferSelect): ChildRecord {
  return {
    id: row.id,
    displayName: row.displayName,
    portalType: row.portalType,
    baseUrl: row.baseUrl,
    username: row.username,
    grade: row.grade,
    school: row.school,
    homeworkUrl: row.homeworkUrl,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Fetch + persist all applicable sources for one child. Loads the child row,
 * builds the runner, and runs each source. Returns the per-source summary; the
 * fetch_runs rows carry the success/failed/parser_error status.
 */
export async function runFetch(
  childId: string,
  options: RunFetchOptions = {},
): Promise<FetchRunnerSummary> {
  const db = options.db ?? defaultDb;

  const [row] = await db.select().from(children).where(eq(children.id, childId));
  if (!row) throw new Error(`runFetch: child ${childId} not found`);
  const child = toChildRecord(row);

  const fetchImpl = options.fetchImpl ?? createNodeFetch();
  const getPassword =
    options.getPassword ?? (async (id: string) => (id === row.id ? row.portalPassword : null));

  const sources = [new TeacherEaseSource(db, getPassword), new HomeworkSource(db)];
  const deps: FetchRunnerDeps = {
    startFetchRun: (cid, source) => startFetchRun(db, cid, source),
    completeFetchRun: (id, result) => completeFetchRun(db, id, result),
    log: (msg) => console.info(JSON.stringify({ level: "info", event: "fetch", msg })),
    logErr: (msg) => console.error(JSON.stringify({ level: "error", event: "fetch", msg })),
  };

  const runner = new FetchRunner(sources, deps);
  return runner.runAll({ child, fetchImpl });
}
