import { describe, expect, it } from "vitest";
import { teacherBand, teacherDisagrees, teacherShortLabel, teDueToIso } from "./teacher-match.js";

describe("teacherBand", () => {
  it("reads TeacherEase's scores", () => {
    expect(teacherBand("3=M", "M")).toBe("meets");
    expect(teacherBand("2.5=P")).toBe("progressing");
    expect(teacherBand("1=PS")).toBe("beginning");
    expect(teacherBand("1=B", "B")).toBe("beginning");
    expect(teacherBand("Missing")).toBe("missing");
    expect(teacherBand("", null, true)).toBe("missing");
    expect(teacherBand("Assignment Turned In Late")).toBe("late");
    expect(teacherBand("Excused")).toBe("excused");
    expect(teacherBand("Handed In")).toBe("handed_in");
    expect(teacherBand("")).toBeNull();
    expect(teacherBand(null)).toBeNull();
  });
  it("labels bands for a chip", () => {
    expect(teacherShortLabel("meets", "3=M")).toBe("M");
    expect(teacherShortLabel("other", "7/10")).toBe("7/10");
  });
});

describe("teDueToIso", () => {
  it("puts the gradebook's M/D in the year nearest the item's day", () => {
    expect(teDueToIso("11/2", "2026-11-02")).toBe("2026-11-02");
    expect(teDueToIso("12/30", "2027-01-02")).toBe("2026-12-30");
    expect(teDueToIso("1/3", "2026-12-30")).toBe("2027-01-03");
    expect(teDueToIso("2/30", "2026-02-01")).toBeNull();
    expect(teDueToIso("", "2026-02-01")).toBeNull();
  });
});

describe("teacherDisagrees", () => {
  it("flags a teacher lower or higher than the model", () => {
    expect(teacherDisagrees("progressing", 90, 80)).toBe("teacher_lower");
    expect(teacherDisagrees("missing", 85, 80)).toBe("teacher_lower");
    expect(teacherDisagrees("meets", 60, 80)).toBe("teacher_higher");
    expect(teacherDisagrees("meets", 90, 80)).toBeNull();
    expect(teacherDisagrees("progressing", 70, 80)).toBeNull();
    expect(teacherDisagrees("meets", null, 80)).toBeNull();
  });
});
