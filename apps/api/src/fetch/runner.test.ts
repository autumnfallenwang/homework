import { describe, expect, it, vi } from "vitest";
import { ParserError } from "../scraper/types.js";
import { FetchRunner } from "./runner.js";
import type { FetchRunnerDeps, FetchSource } from "./types.js";

const child = {
  id: "c1",
  displayName: "Child",
  portalType: "teacherease",
  baseUrl: "https://x.example.com",
  username: "u",
  grade: null,
  school: null,
  homeworkUrl: null,
  homeworkSource: "page" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function makeDeps(): FetchRunnerDeps & {
  completions: Array<{ id: string; status: string }>;
} {
  const completions: Array<{ id: string; status: string }> = [];
  let n = 0;
  return {
    completions,
    startFetchRun: vi.fn(async () => `run-${++n}`),
    completeFetchRun: vi.fn(async (id, result) => {
      completions.push({ id, status: result.status });
    }),
    log: vi.fn(),
    logErr: vi.fn(),
    now: () => 0,
  };
}

const fetchImpl = vi.fn();

describe("FetchRunner.runAll", () => {
  it("records success when a source completes", async () => {
    const deps = makeDeps();
    const source: FetchSource = {
      name: "ok",
      isApplicable: () => true,
      run: async () => {},
    };
    const summary = await new FetchRunner([source], deps).runAll({ child, fetchImpl });
    expect(summary.successes).toBe(1);
    expect(deps.completions[0]?.status).toBe("success");
  });

  it("classifies a ParserError as parser_error", async () => {
    const deps = makeDeps();
    const source: FetchSource = {
      name: "bad",
      isApplicable: () => true,
      run: async () => {
        throw new ParserError("boom");
      },
    };
    const summary = await new FetchRunner([source], deps).runAll({ child, fetchImpl });
    expect(summary.failures).toBe(1);
    expect(deps.completions[0]?.status).toBe("parser_error");
  });

  it("classifies a generic error as failed", async () => {
    const deps = makeDeps();
    const source: FetchSource = {
      name: "bad",
      isApplicable: () => true,
      run: async () => {
        throw new Error("network down");
      },
    };
    await new FetchRunner([source], deps).runAll({ child, fetchImpl });
    expect(deps.completions[0]?.status).toBe("failed");
  });

  it("logs one structured line per source outcome — fields, not an interpolated message", async () => {
    const deps = makeDeps();
    const boom = new Error("network down");
    const sources: FetchSource[] = [
      { name: "ok", isApplicable: () => true, run: async () => {} },
      {
        name: "bad",
        isApplicable: () => true,
        run: async () => {
          throw boom;
        },
      },
    ];
    await new FetchRunner(sources, deps).runAll({ child, fetchImpl });
    expect(deps.log).toHaveBeenCalledWith(
      {
        event: "fetch.source.done",
        source: "ok",
        child_id: child.id,
        fetch_run_id: "run-1",
        status: "success",
        duration_ms: 0,
      },
      "fetch source finished",
    );
    expect(deps.logErr).toHaveBeenCalledTimes(1);
    expect(deps.logErr).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "fetch.source.done",
        source: "bad",
        fetch_run_id: "run-2",
        status: "failed",
        err: boom,
      }),
      "fetch source failed",
    );
  });

  it("skips inapplicable sources and isolates failures from later sources", async () => {
    const deps = makeDeps();
    const sources: FetchSource[] = [
      { name: "skip", isApplicable: () => false, run: async () => {} },
      {
        name: "fail",
        isApplicable: () => true,
        run: async () => {
          throw new Error("x");
        },
      },
      { name: "ok", isApplicable: () => true, run: async () => {} },
    ];
    const summary = await new FetchRunner(sources, deps).runAll({ child, fetchImpl });
    expect(summary).toMatchObject({ successes: 1, failures: 1, skipped: 1 });
  });
});
