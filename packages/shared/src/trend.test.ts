import { describe, expect, it } from "vitest";
import { computeTrend } from "./trend.js";

describe("computeTrend", () => {
  it("returns stable when history is empty", () => {
    expect(computeTrend([])).toBe("stable");
  });

  it("returns stable when only one entry", () => {
    expect(computeTrend([{ status: "meeting" }])).toBe("stable");
  });

  it("returns stable when status unchanged", () => {
    expect(computeTrend([{ status: "meeting" }, { status: "meeting" }])).toBe("stable");
  });

  it("returns up when improved from needs_attention to meeting", () => {
    expect(computeTrend([{ status: "meeting" }, { status: "needs_attention" }])).toBe("up");
  });

  it("returns down when declined from meeting to needs_attention", () => {
    expect(computeTrend([{ status: "needs_attention" }, { status: "meeting" }])).toBe("down");
  });

  it("returns up when improved from needs_attention to not_assessed", () => {
    expect(computeTrend([{ status: "not_assessed" }, { status: "needs_attention" }])).toBe("up");
  });

  it("returns down when declined from not_assessed to needs_attention", () => {
    expect(computeTrend([{ status: "needs_attention" }, { status: "not_assessed" }])).toBe("down");
  });

  it("returns up when improved from not_assessed to meeting", () => {
    expect(computeTrend([{ status: "meeting" }, { status: "not_assessed" }])).toBe("up");
  });

  it("ignores entries beyond the first two", () => {
    expect(
      computeTrend([{ status: "meeting" }, { status: "needs_attention" }, { status: "meeting" }]),
    ).toBe("up");
  });

  it("handles null status gracefully", () => {
    expect(computeTrend([{ status: null }, { status: "meeting" }])).toBe("down");
    expect(computeTrend([{ status: "meeting" }, { status: null }])).toBe("up");
  });
});
