// Fast scheduler tests — the run wrapper and shutdown drain, no DB and no cron.

import { Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger, log } from "../lib/logger.js";
import { drainScheduler, runJob } from "./scheduler.js";

/** A logger writing to a buffer; it shares the module's log context. */
function capture() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      for (const line of chunk.toString().split("\n").filter(Boolean)) lines.push(JSON.parse(line));
      done();
    },
  });
  return { lines, logger: createLogger(stream) };
}

afterEach(() => vi.restoreAllMocks());

describe("runJob", () => {
  it("★ gives every line of one run the same { job, run_id }, and each run its own", async () => {
    const { lines, logger } = capture();
    const body = async () => {
      logger.info({ event: "step.one" }, "static");
      await Promise.resolve();
      logger.info({ event: "step.two" }, "static");
    };
    await runJob("fetch", body);
    await runJob("fetch", body);

    expect(lines).toHaveLength(4);
    expect(lines.every((line) => line.job === "fetch")).toBe(true);
    expect(lines[0]?.run_id).toBe(lines[1]?.run_id);
    expect(lines[2]?.run_id).toBe(lines[3]?.run_id);
    expect(lines[0]?.run_id).not.toBe(lines[2]?.run_id);
  });

  it("logs a failed run as one error line and does not reject", async () => {
    const error = vi.spyOn(log, "error").mockImplementation((() => {}) as never);
    const boom = new Error("db gone");
    await expect(
      runJob("notify", async () => {
        throw boom;
      }),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      { event: "scheduler.tick.failed", err: boom },
      "scheduled run failed",
    );
  });
});

describe("drainScheduler", () => {
  it("★ waits for a run already in flight before returning", async () => {
    let finished = false;
    void runJob("fetch", async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      finished = true;
    });
    await drainScheduler(5_000);
    expect(finished).toBe(true);
  });

  it("gives up after the timeout and says so", async () => {
    const warn = vi.spyOn(log, "warn").mockImplementation((() => {}) as never);
    let release: () => void = () => {};
    const run = runJob("fetch", () => new Promise<void>((resolve) => (release = resolve)));
    await drainScheduler(20);
    expect(warn).toHaveBeenCalledWith(
      { event: "scheduler.drain_timeout", in_flight: 1 },
      "gave up waiting for in-flight runs",
    );
    release();
    await run;
  });
});
