import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  createHomeworkItemSchema,
  groupHomeworkItems,
  type HomeworkItem,
  homeworkClassListSchema,
  isoDaySchema,
  nextSchoolDay,
} from "./homework-entry.js";

function item(id: string, dueOn: string, overrides: Partial<HomeworkItem> = {}): HomeworkItem {
  return {
    id,
    childId: "c",
    classId: null,
    className: "Other",
    kind: "homework",
    title: id,
    details: null,
    assignedOn: "2026-09-28",
    dueOn,
    status: "todo",
    completedAt: null,
    createdAt: `2026-09-28T10:00:0${id.length}Z`,
    updatedAt: "2026-09-28T10:00:00Z",
    createdByName: "Ivy",
    photos: [],
    ...overrides,
  };
}

describe("dates", () => {
  it("steps over month ends and finds the next school day", () => {
    expect(addDaysIso("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
    expect(nextSchoolDay("2026-09-30")).toBe("2026-10-01"); // Wed → Thu
    expect(nextSchoolDay("2026-10-02")).toBe("2026-10-05"); // Fri → Mon
    expect(nextSchoolDay("2026-10-03")).toBe("2026-10-05"); // Sat → Mon
  });

  it("accepts real calendar days only", () => {
    expect(isoDaySchema.safeParse("2026-02-28").success).toBe(true);
    expect(isoDaySchema.safeParse("2026-02-30").success).toBe(false);
    expect(isoDaySchema.safeParse("2026-9-1").success).toBe(false);
  });
});

describe("groupHomeworkItems", () => {
  it("groups open items by due day (Wednesday), tests first within a day, done newest first", () => {
    const groups = groupHomeworkItems(
      [
        item("later", "2026-10-14"),
        item("overdue", "2026-09-29"),
        item("today", "2026-09-30"),
        item("tomorrow-hw", "2026-10-01"),
        item("tomorrow-test", "2026-10-01", { kind: "test" }),
        item("friday", "2026-10-02"),
        item("sunday", "2026-10-04"),
        item("monday", "2026-10-05"),
        item("done-old", "2026-09-20", { status: "done" }),
        item("done-new", "2026-09-30", { status: "done" }),
      ],
      "2026-09-30",
    );
    expect(groups.open.map((g) => [g.key, g.items.map((i) => i.id)])).toEqual([
      ["overdue", ["overdue"]],
      ["today", ["today"]],
      ["tomorrow", ["tomorrow-test", "tomorrow-hw"]],
      ["this_week", ["friday", "sunday"]],
      ["later", ["monday", "later"]],
    ]);
    expect(groups.done.map((i) => i.id)).toEqual(["done-new", "done-old"]);
  });

  it("leaves empty groups out", () => {
    expect(groupHomeworkItems([], "2026-09-30")).toEqual({ open: [], done: [] });
  });
});

describe("input schemas", () => {
  it("rejects Other, duplicate names and duplicate ids in a class list", () => {
    const ok = homeworkClassListSchema.safeParse({ classes: [{ name: " Math " }, { name: "PE" }] });
    expect(ok.success && ok.data.classes[0]?.name).toBe("Math");
    for (const classes of [
      [{ name: "other" }],
      [{ name: "Math" }, { name: "math" }],
      [
        { id: "00000000-0000-4000-8000-000000000001", name: "A" },
        { id: "00000000-0000-4000-8000-000000000001", name: "B" },
      ],
    ]) {
      expect(homeworkClassListSchema.safeParse({ classes }).success).toBe(false);
    }
  });

  it("needs a title and a real due date for a new item", () => {
    const base = { classId: null, kind: "test", title: "Ch. 2", dueOn: "2026-10-01" };
    expect(createHomeworkItemSchema.safeParse(base).success).toBe(true);
    expect(createHomeworkItemSchema.safeParse({ ...base, title: "   " }).success).toBe(false);
    expect(createHomeworkItemSchema.safeParse({ ...base, dueOn: "tomorrow" }).success).toBe(false);
    expect(createHomeworkItemSchema.safeParse({ ...base, title: "x".repeat(121) }).success).toBe(
      false,
    );
  });
});
