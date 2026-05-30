import { describe, expect, it } from "vitest";
import { dueDateToIso, hwDateToIso, inferDueDateIso, resolveDueDate } from "./homework-date.js";

describe("hwDateToIso", () => {
  it("normalizes M/D/YY to YYYY-MM-DD", () => {
    expect(hwDateToIso("4/14/26")).toBe("2026-04-14");
    expect(hwDateToIso("12/3/25")).toBe("2025-12-03");
  });

  it("returns null on unparseable input", () => {
    expect(hwDateToIso("")).toBeNull();
    expect(hwDateToIso("April 14")).toBeNull();
    expect(hwDateToIso("13/40/26")).toBeNull();
  });
});

describe("dueDateToIso", () => {
  it("anchors the year on the hw date", () => {
    expect(dueDateToIso("Friday 4/17", "2026-04-14")).toBe("2026-04-17");
  });

  it("rolls forward a year on Dec→Jan wraparound", () => {
    expect(dueDateToIso("Monday 1/5", "2025-12-19")).toBe("2026-01-05");
  });

  it("returns null when no M/D pattern is present", () => {
    expect(dueDateToIso("TBD", "2026-04-14")).toBeNull();
    expect(dueDateToIso(null, "2026-04-14")).toBeNull();
  });
});

describe("inferDueDateIso", () => {
  it("returns the next day for a weekday", () => {
    expect(inferDueDateIso("2026-04-14")).toBe("2026-04-15"); // Tue → Wed
  });

  it("snaps Saturday/Sunday forward to Monday", () => {
    // 2026-04-17 is a Friday → +1 = Saturday → Monday 4/20
    expect(inferDueDateIso("2026-04-17")).toBe("2026-04-20");
  });
});

describe("resolveDueDate", () => {
  it("prefers a parsed due date", () => {
    expect(resolveDueDate("Friday 4/17", "2026-04-14")).toEqual({
      iso: "2026-04-17",
      inferred: false,
    });
  });

  it("falls back to inference when parsing fails", () => {
    expect(resolveDueDate("TBD", "2026-04-14")).toEqual({ iso: "2026-04-15", inferred: true });
  });

  it("returns null iso when even the anchor is malformed", () => {
    expect(resolveDueDate("TBD", "not-a-date")).toEqual({ iso: null, inferred: false });
  });
});
