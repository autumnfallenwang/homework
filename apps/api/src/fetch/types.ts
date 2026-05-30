// Fetch pipeline contract. Pure types module. Ported from the desktop app;
// ids are uuid strings (M02 schema), and the transport `FetchImpl` is threaded
// through the context so sources don't import a global fetch.

import type { ChildRecord, FetchImpl } from "../scraper/types.js";

export type FetchRunStatus = "success" | "failed" | "parser_error";

/** Passed to each source when the runner invokes it. */
export interface FetchContext {
  readonly child: ChildRecord;
  readonly childId: string;
  /** Pre-inserted fetch_runs row id. Sources FK child rows to this. */
  readonly fetchRunId: string;
  /** Injected fetch (Node transport in prod, fake in tests). */
  readonly fetchImpl: FetchImpl;
}

/** One data source = one `fetch_runs` row per applicable run. */
export interface FetchSource {
  /** Stored in `fetch_runs.source`. Lowercase: `"teacherease"`, `"homework"`. */
  readonly name: string;
  isApplicable(child: ChildRecord): boolean;
  /** Do the fetch/parse/persist work. Throws on failure — runner records it. */
  run(ctx: FetchContext): Promise<void>;
}

export interface FetchRunCompletion {
  readonly status: FetchRunStatus;
  readonly durationMs: number;
  readonly errorMessage?: string;
}

/** Dependencies injected into `FetchRunner` — makes testability explicit. */
export interface FetchRunnerDeps {
  startFetchRun: (childId: string, source: string) => Promise<string>;
  completeFetchRun: (id: string, result: FetchRunCompletion) => Promise<void>;
  log: (message: string) => void;
  logErr: (message: string) => void;
  now?: () => number;
}

export interface FetchRunnerRun {
  readonly source: string;
  readonly fetchRunId: string;
  readonly status: FetchRunStatus;
  readonly durationMs: number;
  readonly errorMessage?: string;
}

export interface FetchRunnerSummary {
  readonly successes: number;
  readonly failures: number;
  readonly skipped: number;
  readonly runs: readonly FetchRunnerRun[];
}
