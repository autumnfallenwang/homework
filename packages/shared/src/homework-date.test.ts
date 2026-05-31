import { describe, expect, it } from "vitest";
import { dueDateToIso, hwDateToIso, inferDueDateIso, resolveDueDate } from "./homework-date.js";

describe("hwDateToIso", () => {
  it("parses M/D/YY", () => {
    expect(hwDateToIso("4/17/26")).toBe("2026-04-17");
  });

  it("zero-pads single digits", () => {
    expect(hwDateToIso("1/5/26")).toBe("2026-01-05");
  });

  it("tolerates leading/trailing whitespace", () => {
    expect(hwDateToIso("  4/17/26  ")).toBe("2026-04-17");
  });

  it("returns null on garbage", () => {
    expect(hwDateToIso("")).toBeNull();
    expect(hwDateToIso("xyz")).toBeNull();
    expect(hwDateToIso("4/17")).toBeNull();
    expect(hwDateToIso("2026-04-17")).toBeNull();
  });

  it("rejects out-of-range values", () => {
    expect(hwDateToIso("13/1/26")).toBeNull();
    expect(hwDateToIso("4/32/26")).toBeNull();
    expect(hwDateToIso("0/5/26")).toBeNull();
  });
});

describe("dueDateToIso", () => {
  it("parses 'Friday 4/17' against same-month hw_date", () => {
    expect(dueDateToIso("Friday 4/17", "2026-04-17")).toBe("2026-04-17");
  });

  it("returns a later date in the same year when due is after hw", () => {
    expect(dueDateToIso("Monday 5/3", "2026-04-17")).toBe("2026-05-03");
  });

  it("rolls the year forward on Dec → Jan wraparound", () => {
    expect(dueDateToIso("Monday 1/5", "2025-12-20")).toBe("2026-01-05");
  });

  it("same day as hw_date stays in same year", () => {
    expect(dueDateToIso("Friday 4/17", "2026-04-17")).toBe("2026-04-17");
  });

  it("tolerates double spaces", () => {
    expect(dueDateToIso("Tuesday  3/24", "2026-03-20")).toBe("2026-03-24");
  });

  it("tolerates abbreviated weekday", () => {
    expect(dueDateToIso("Fri 4/17", "2026-04-17")).toBe("2026-04-17");
  });

  it("does not validate weekday match (trusts M/D)", () => {
    // 2026-04-17 is a Friday, not a Monday — teacher typo'd the weekday
    expect(dueDateToIso("Monday 4/17", "2026-04-17")).toBe("2026-04-17");
  });

  it("handles leading zeros on month/day", () => {
    expect(dueDateToIso("Tuesday 04/07", "2026-04-01")).toBe("2026-04-07");
  });

  it("returns null on null input", () => {
    expect(dueDateToIso(null, "2026-04-17")).toBeNull();
  });

  it("returns null on unparseable shape", () => {
    expect(dueDateToIso("TBD", "2026-04-17")).toBeNull();
    expect(dueDateToIso("Tomorrow", "2026-04-17")).toBeNull();
    expect(dueDateToIso("Apr 17", "2026-04-17")).toBeNull();
  });

  it("returns null on out-of-range M/D", () => {
    expect(dueDateToIso("Friday 13/40", "2026-04-17")).toBeNull();
    expect(dueDateToIso("Friday 4/0", "2026-04-17")).toBeNull();
  });

  it("returns null on malformed anchor", () => {
    expect(dueDateToIso("Friday 4/17", "not-a-date")).toBeNull();
  });
});

describe("inferDueDateIso", () => {
  it("weekday + 1 returns the next calendar day", () => {
    // 2026-04-13 is a Monday
    expect(inferDueDateIso("2026-04-13")).toBe("2026-04-14");
  });

  it("snaps Saturday forward to Monday when hw is Friday", () => {
    // 2026-04-17 is Friday; +1 = Saturday → snap to Monday 4/20
    expect(inferDueDateIso("2026-04-17")).toBe("2026-04-20");
  });

  it("snaps Sunday forward to Monday when hw is Saturday", () => {
    // 2026-04-18 is Saturday; +1 = Sunday → snap to Monday 4/20
    expect(inferDueDateIso("2026-04-18")).toBe("2026-04-20");
  });

  it("returns Monday when hw is Sunday", () => {
    // 2026-04-19 is Sunday; +1 = Monday 4/20 → already a school day
    expect(inferDueDateIso("2026-04-19")).toBe("2026-04-20");
  });

  it("handles month boundary", () => {
    // 2026-04-30 is Thursday; +1 = Friday 5/1
    expect(inferDueDateIso("2026-04-30")).toBe("2026-05-01");
  });

  it("handles year boundary", () => {
    // 2026-12-31 is Thursday; +1 = Friday 1/1/2027
    expect(inferDueDateIso("2026-12-31")).toBe("2027-01-01");
  });

  it("returns null on malformed input", () => {
    expect(inferDueDateIso("not-a-date")).toBeNull();
    expect(inferDueDateIso("")).toBeNull();
  });
});

describe("resolveDueDate", () => {
  it("returns authoritative when parseable", () => {
    expect(resolveDueDate("Friday 4/17", "2026-04-17")).toEqual({
      iso: "2026-04-17",
      inferred: false,
    });
  });

  it("falls back to inferred on null raw", () => {
    // Friday 4/17 + 1 = Saturday → Monday 4/20
    expect(resolveDueDate(null, "2026-04-17")).toEqual({
      iso: "2026-04-20",
      inferred: true,
    });
  });

  it("falls back to inferred on unparseable raw", () => {
    expect(resolveDueDate("TBD", "2026-04-13")).toEqual({
      iso: "2026-04-14",
      inferred: true,
    });
  });

  it("returns null iso when even the anchor is malformed", () => {
    expect(resolveDueDate(null, "garbage")).toEqual({
      iso: null,
      inferred: false,
    });
  });
});
