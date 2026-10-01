import { describe, expect, it } from "vitest";
import { dueLabel, formatShortDay } from "./homework-format.js";
import { fitWithin } from "./photo-shrink.js";

describe("homework display helpers", () => {
  it("labels due days relative to today", () => {
    expect(dueLabel("2026-09-30", "2026-09-30")).toBe("Today");
    expect(dueLabel("2026-10-01", "2026-09-30")).toBe("Tomorrow");
    expect(dueLabel("2026-10-02", "2026-09-30")).toBe("Fri 10/2");
    expect(formatShortDay("2026-09-29")).toBe("Tue 9/29");
  });

  it("fits a photo within 1600 px on its long side, never enlarging it", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
