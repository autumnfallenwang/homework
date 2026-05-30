// FetchRunner. Orchestrates FetchSource invocations and the fetch_runs row
// lifecycle. Sequential execution, per-source error isolation. Ported from the
// desktop app; adds parser_error classification (ParserError → 'parser_error',
// anything else → 'failed').

import { ParserError } from "../scraper/types.js";
import type {
  FetchContext,
  FetchRunnerDeps,
  FetchRunnerRun,
  FetchRunnerSummary,
  FetchRunStatus,
  FetchSource,
} from "./types.js";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export class FetchRunner {
  constructor(
    private readonly sources: readonly FetchSource[],
    private readonly deps: FetchRunnerDeps,
  ) {}

  /**
   * Run every applicable source for `child`, sequentially. Each source gets a
   * fresh fetch_runs row. A failure in one source is recorded and does not stop
   * the next.
   */
  async runAll(ctx: {
    child: FetchContext["child"];
    fetchImpl: FetchContext["fetchImpl"];
  }): Promise<FetchRunnerSummary> {
    const now = this.deps.now ?? Date.now;
    const child = ctx.child;
    let successes = 0;
    let failures = 0;
    let skipped = 0;
    const runs: FetchRunnerRun[] = [];

    for (const source of this.sources) {
      if (!source.isApplicable(child)) {
        skipped += 1;
        continue;
      }

      const start = now();
      const fetchRunId = await this.deps.startFetchRun(child.id, source.name);
      this.deps.log(`fetch: started source=${source.name} childId=${child.id} id=${fetchRunId}`);

      try {
        await source.run({ child, childId: child.id, fetchRunId, fetchImpl: ctx.fetchImpl });
        const durationMs = now() - start;
        await this.deps.completeFetchRun(fetchRunId, { status: "success", durationMs });
        this.deps.log(
          `fetch: complete source=${source.name} childId=${child.id} id=${fetchRunId} durationMs=${durationMs}`,
        );
        successes += 1;
        runs.push({ source: source.name, fetchRunId, status: "success", durationMs });
      } catch (err) {
        const durationMs = now() - start;
        const errorMessage = describeError(err);
        const status: FetchRunStatus = err instanceof ParserError ? "parser_error" : "failed";
        await this.deps.completeFetchRun(fetchRunId, { status, durationMs, errorMessage });
        this.deps.logErr(
          `fetch: ${status} source=${source.name} childId=${child.id} id=${fetchRunId} — ${errorMessage}`,
        );
        failures += 1;
        runs.push({ source: source.name, fetchRunId, status, durationMs, errorMessage });
        // Swallow — next source still runs.
      }
    }

    return { successes, failures, skipped, runs };
  }
}
