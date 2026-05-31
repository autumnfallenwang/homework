import { describe, expect, it } from "vitest";
import { computeSlots, firstSlotToMinutes, slotToCron } from "./schedule.js";

describe("firstSlotToMinutes", () => {
  it("parses HH:MM", () => {
    expect(firstSlotToMinutes("09:00")).toBe(540);
    expect(firstSlotToMinutes("08:30")).toBe(510);
    expect(firstSlotToMinutes("00:00")).toBe(0);
  });

  it("falls back to 0 on garbage", () => {
    expect(firstSlotToMinutes("nope")).toBe(0);
  });
});

describe("computeSlots", () => {
  it("spreads N runs evenly from the anchor", () => {
    // 3/day from 09:00 → step 480 → 540, 1020, 1500%1440=60
    expect(computeSlots(3, "09:00")).toEqual([540, 1020, 60]);
  });

  it("handles a single run", () => {
    expect(computeSlots(1, "07:00")).toEqual([420]);
  });

  it("spreads 2 runs 12h apart", () => {
    expect(computeSlots(2, "08:00")).toEqual([480, 1200]);
  });

  it("clamps runsPerDay above the max", () => {
    expect(computeSlots(99, "00:00")).toHaveLength(8);
  });

  it("clamps runsPerDay below the min", () => {
    expect(computeSlots(0, "00:00")).toHaveLength(1);
  });
});

describe("slotToCron", () => {
  it("formats a slot as a cron expression", () => {
    expect(slotToCron(540, false)).toBe("0 9 * * *");
    expect(slotToCron(510, false)).toBe("30 8 * * *");
    expect(slotToCron(60, false)).toBe("0 1 * * *");
  });

  it("restricts to weekdays when requested", () => {
    expect(slotToCron(540, true)).toBe("0 9 * * 1-5");
  });
});
