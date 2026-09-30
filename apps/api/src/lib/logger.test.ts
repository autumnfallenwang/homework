import { Writable } from "node:stream";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";
import { createLogger, withLogContext } from "./logger.js";

/**
 * The log line's SHAPE is a contract with Loki and every query written against
 * it, so it is tested by reading real JSON back: the same options, writing to a
 * captured stream instead of fd 1.
 */
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

describe("the log line", () => {
  it("★ writes the level as a WORD — Loki's detected_level needs it", () => {
    const { lines, logger } = capture();
    logger.info({ event: "a" }, "static");
    logger.warn({ event: "b" }, "static");
    logger.error({ event: "c" }, "static");
    logger.fatal({ event: "d" }, "static");
    expect(lines.map((line) => line.level)).toEqual(["info", "warn", "error", "fatal"]);
  });

  it("carries the house fields: service, version, ISO time, event, msg", () => {
    const { lines, logger } = capture();
    logger.info({ event: "server.start" }, "api server listening");
    expect(lines[0]).toMatchObject({
      service: "homework-api",
      event: "server.start",
      msg: "api server listening",
    });
    expect(String(lines[0]?.version)).toMatch(/^\d+\.\d+\.\d+/);
    expect(String(lines[0]?.time)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("★ adds the request's or job run's context to every line inside it, and only there", async () => {
    const { lines, logger } = capture();
    withLogContext({ req_id: "r-1" }, () => logger.info({ event: "inside" }, "static"));
    await withLogContext({ job: "fetch", run_id: "run-1" }, async () => {
      await Promise.resolve();
      withLogContext({ step: "child" }, () => logger.info({ event: "nested" }, "static"));
    });
    logger.info({ event: "outside" }, "static");
    expect(lines[0]).toMatchObject({ event: "inside", req_id: "r-1" });
    expect(lines[1]).toMatchObject({ job: "fetch", run_id: "run-1", step: "child" });
    expect(lines[2]).not.toHaveProperty("req_id");
    expect(lines[2]).not.toHaveProperty("run_id");
  });

  it("★ one line's fields never leak onto the next line in the same context", () => {
    const { lines, logger } = capture();
    withLogContext({ job: "fetch", run_id: "run-1" }, () => {
      logger.error({ event: "fetch.source.done", status: "failed", err: new Error("x") }, "s");
      logger.info({ event: "scheduler.fetch.done" }, "s");
    });
    expect(lines[1]).toMatchObject({
      event: "scheduler.fetch.done",
      job: "fetch",
      run_id: "run-1",
    });
    expect(lines[1]).not.toHaveProperty("status");
    expect(lines[1]).not.toHaveProperty("err");
  });

  it("serialises an Error under `err` with its stack, on one line", () => {
    const { lines, logger } = capture();
    logger.error({ event: "x", err: new Error("boom") }, "static");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.err).toMatchObject({ type: "Error", message: "boom" });
    expect(String((lines[0]?.err as { stack?: string } | undefined)?.stack)).toContain("boom");
  });

  it("★ never writes a failed query's bound parameters — they can be plaintext passwords", () => {
    const { lines, logger } = capture();
    const cause = new Error("getaddrinfo ENOTFOUND homework-db");
    const query = 'update "children" set "portal_password" = $1 where "id" = $2';
    const err = new DrizzleQueryError(query, ["hunter2-SECRET", "child-1"], cause);
    logger.error({ event: "x", err }, "static");
    // Wrapped as the cause of another error, pino folds it into the outer message.
    logger.error({ event: "y", err: new Error("wrapper", { cause: err }) }, "static");

    for (const line of lines) expect(JSON.stringify(line)).not.toContain("hunter2-SECRET");
    const out = lines[0]?.err as Record<string, string>;
    expect(out.type).toBe("DrizzleQueryError");
    expect(out.query).toBe(query); // the SQL stays — it is what makes the error debuggable
    expect(out.params).toBe("[redacted]");
    expect(out.message).toContain("params: [redacted]");
    expect(out.message).toContain("ENOTFOUND"); // the cause survives
    expect(out.stack).toContain("params: [redacted]");
  });

  it("★ never writes a password-shaped field", () => {
    const { lines, logger } = capture();
    logger.info(
      {
        password: "pw-1",
        portalPassword: "pw-2",
        smtp: { password: "pw-3" },
        auth: { pass: "pw-4" },
      },
      "static",
    );
    const text = JSON.stringify(lines[0]);
    for (const secret of ["pw-1", "pw-2", "pw-3", "pw-4"]) expect(text).not.toContain(secret);
    expect(text).toContain("[redacted]");
  });
});
