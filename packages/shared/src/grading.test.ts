import { describe, expect, it } from "vitest";
import {
  GRADING_LIMITS,
  gradeNeedsParent,
  gradePhotoLabel,
  gradingSettingsSchema,
  nextGradeAttemptAt,
} from "./grading.js";

describe("gradeNeedsParent", () => {
  const g = (status: "graded" | "retake" | "not_gradable" | "failed", score: number | null) => ({
    status,
    score,
  });
  it("is true below the alert score and false at or above it", () => {
    expect(gradeNeedsParent(g("graded", 79), 80)).toBe(true);
    expect(gradeNeedsParent(g("graded", 80), 80)).toBe(false);
    expect(gradeNeedsParent(g("graded", 0), 0)).toBe(false);
  });
  it("is false for a retake, not gradable and failed — retakes go to the app and the digest", () => {
    expect(gradeNeedsParent(g("retake", null), 80)).toBe(false);
    expect(gradeNeedsParent(g("not_gradable", null), 80)).toBe(false);
    expect(gradeNeedsParent(g("failed", null), 80)).toBe(false);
  });
});

describe("nextGradeAttemptAt", () => {
  const at = new Date("2026-11-10T20:00:00Z");
  it("waits 5 min after the first failure, 30 after the second, never after the third", () => {
    expect(nextGradeAttemptAt(0, at)).toEqual(at);
    expect(nextGradeAttemptAt(1, at)?.getTime()).toBe(at.getTime() + 5 * 60_000);
    expect(nextGradeAttemptAt(2, at)?.getTime()).toBe(at.getTime() + 30 * 60_000);
    expect(nextGradeAttemptAt(GRADING_LIMITS.maxAttempts, at)).toBeNull();
  });
});

describe("grading helpers", () => {
  it("labels photos the way the pages number them", () => {
    expect(gradePhotoLabel("sheet", 0)).toBe("Sheet photo 1");
    expect(gradePhotoLabel("solution", 6)).toBe("Solution photo 7");
  });
  it("validates settings", () => {
    const ok = {
      enabled: true,
      model: "claude-sonnet-5-5",
      fallbackModel: "",
      alertBelow: 80,
      instructions: "",
      matchModel: "claude-haiku-5-5",
    };
    expect(gradingSettingsSchema.safeParse(ok).success).toBe(true);
    expect(gradingSettingsSchema.safeParse({ ...ok, model: " " }).success).toBe(false);
    expect(gradingSettingsSchema.safeParse({ ...ok, alertBelow: 100.5 }).success).toBe(false);
  });
});
