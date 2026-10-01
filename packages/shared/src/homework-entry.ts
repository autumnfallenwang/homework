// Child-entered homework (ADR 0006): each child profile takes its homework from
// the class homework page (`page`) or from the child's own entries (`child`).
// Entries are homework items in a parent-owned class list (or Other), with up
// to four photos each. Shapes shared by the API and the web.

import { z } from "zod";

export const homeworkSourceSchema = z.enum(["page", "child"]);
export type HomeworkSource = z.infer<typeof homeworkSourceSchema>;

export const homeworkKindSchema = z.enum(["homework", "test", "project", "other"]);
export type HomeworkKind = z.infer<typeof homeworkKindSchema>;

export const homeworkStatusSchema = z.enum(["todo", "done"]);
export type HomeworkStatus = z.infer<typeof homeworkStatusSchema>;

export const HOMEWORK_KIND_LABELS: Record<HomeworkKind, string> = {
  homework: "Homework",
  test: "Test",
  project: "Project",
  other: "Other",
};

/** The class choice every child has after the parent's list. Not a stored class. */
export const OTHER_CLASS_LABEL = "Other";

export const HOMEWORK_LIMITS = {
  classNameMax: 40,
  classesMax: 30,
  titleMax: 120,
  detailsMax: 2000,
  photosPerItem: 4,
  /** After the browser shrinks a photo; the API refuses anything larger. */
  photoBytesMax: 2 * 1024 * 1024,
  /** Done items stay on the list this long after their due day. */
  doneVisibleDays: 30,
} as const;

export const HOMEWORK_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type HomeworkPhotoType = (typeof HOMEWORK_PHOTO_TYPES)[number];

// --- Dates (plain local days, YYYY-MM-DD) ----------------------------------

function parseIsoDay(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? date
    : null;
}

export const isoDaySchema = z
  .string()
  .refine((s) => parseIsoDay(s) !== null, { message: "Expected a date as YYYY-MM-DD" });

export function addDaysIso(iso: string, days: number): string {
  const d = parseIsoDay(iso);
  if (!d) throw new Error(`Not a date: ${iso}`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOfIso(iso: string): number {
  const d = parseIsoDay(iso);
  if (!d) throw new Error(`Not a date: ${iso}`);
  return d.getUTCDay();
}

/** The next Monday–Friday after `iso` — the default due date. */
export function nextSchoolDay(iso: string): string {
  let next = addDaysIso(iso, 1);
  while (weekdayOfIso(next) === 0 || weekdayOfIso(next) === 6) next = addDaysIso(next, 1);
  return next;
}

// --- Class list (parent-owned) ---------------------------------------------

export interface HomeworkClass {
  id: string;
  name: string;
  position: number;
}

const className = z.string().trim().min(1).max(HOMEWORK_LIMITS.classNameMax);

/**
 * PUT /api/children/:id/homework-classes — the whole list, in order. An entry
 * with an `id` keeps that class (a rename renames it on old items too); an entry
 * without one reuses a class of the same name or adds a new one. Classes left out
 * are removed, or archived when items use them.
 */
export const homeworkClassListSchema = z
  .object({
    classes: z
      .array(z.object({ id: z.string().uuid().optional(), name: className }))
      .max(HOMEWORK_LIMITS.classesMax),
  })
  .superRefine((value, ctx) => {
    const seenNames = new Set<string>();
    const seenIds = new Set<string>();
    value.classes.forEach((entry, i) => {
      const key = entry.name.toLowerCase();
      if (key === OTHER_CLASS_LABEL.toLowerCase()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["classes", i, "name"],
          message: `"${OTHER_CLASS_LABEL}" is always offered; it cannot be a class name`,
        });
      }
      if (seenNames.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["classes", i, "name"],
          message: `"${entry.name}" is listed twice`,
        });
      }
      seenNames.add(key);
      if (entry.id) {
        if (seenIds.has(entry.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["classes", i, "id"],
            message: "A class is listed twice",
          });
        }
        seenIds.add(entry.id);
      }
    });
  });
export type HomeworkClassListInput = z.infer<typeof homeworkClassListSchema>;

/** Current TeacherEase class names, offered by "Fill from TeacherEase". */
export interface HomeworkClassSuggestions {
  names: string[];
}

// --- Items -----------------------------------------------------------------

const title = z.string().trim().min(1).max(HOMEWORK_LIMITS.titleMax);
const details = z.string().trim().max(HOMEWORK_LIMITS.detailsMax).nullable();

export const createHomeworkItemSchema = z.object({
  /** A class from the child's list, or null for Other. */
  classId: z.string().uuid().nullable(),
  kind: homeworkKindSchema,
  title,
  details: details.optional(),
  dueOn: isoDaySchema,
});
export type CreateHomeworkItemInput = z.infer<typeof createHomeworkItemSchema>;

export const updateHomeworkItemSchema = z
  .object({
    classId: z.string().uuid().nullable().optional(),
    kind: homeworkKindSchema.optional(),
    title: title.optional(),
    details: details.optional(),
    dueOn: isoDaySchema.optional(),
    status: homeworkStatusSchema.optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "At least one field must be provided",
  });
export type UpdateHomeworkItemInput = z.infer<typeof updateHomeworkItemSchema>;

export interface HomeworkPhotoRef {
  id: string;
  contentType: string;
  byteSize: number;
}

export interface HomeworkItem {
  id: string;
  childId: string;
  /** null = Other (or a class that no longer exists). */
  classId: string | null;
  className: string;
  kind: HomeworkKind;
  title: string;
  details: string | null;
  /** The local day it was entered. */
  assignedOn: string;
  dueOn: string;
  status: HomeworkStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Name of the login that entered it, if it still exists. */
  createdByName: string | null;
  photos: HomeworkPhotoRef[];
}

/** "That's everything for today", for one child and one day. */
export interface HomeworkDay {
  date: string;
  completedAt: string | null;
}

/** GET of a child's list: every to-do item, done items due in the last 30 days. */
export interface HomeworkItemList {
  items: HomeworkItem[];
  today: HomeworkDay;
}

// --- Grouping (the list page, both sides) ------------------------------------

export type HomeworkGroupKey = "overdue" | "today" | "tomorrow" | "this_week" | "later";

export const HOMEWORK_GROUP_TITLES: Record<HomeworkGroupKey, string> = {
  overdue: "Overdue",
  today: "Due today",
  tomorrow: "Due tomorrow",
  this_week: "Later this week",
  later: "Later",
};

export interface HomeworkGroups {
  open: { key: HomeworkGroupKey; items: HomeworkItem[] }[];
  done: HomeworkItem[];
}

function byDueThenTestsFirst(a: HomeworkItem, b: HomeworkItem): number {
  if (a.dueOn !== b.dueOn) return a.dueOn < b.dueOn ? -1 : 1;
  const testA = a.kind === "test" ? 0 : 1;
  const testB = b.kind === "test" ? 0 : 1;
  if (testA !== testB) return testA - testB;
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

/**
 * Open items by when they are due (empty groups left out), earliest first and
 * tests first within a day; done items newest due first. "This week" runs to
 * Sunday.
 */
export function groupHomeworkItems(items: readonly HomeworkItem[], today: string): HomeworkGroups {
  const tomorrow = addDaysIso(today, 1);
  const endOfWeek = addDaysIso(today, (7 - weekdayOfIso(today)) % 7);
  const open = items.filter((i) => i.status !== "done").sort(byDueThenTestsFirst);
  const keyOf = (dueOn: string): HomeworkGroupKey => {
    if (dueOn < today) return "overdue";
    if (dueOn === today) return "today";
    if (dueOn === tomorrow) return "tomorrow";
    if (dueOn <= endOfWeek) return "this_week";
    return "later";
  };
  const order: HomeworkGroupKey[] = ["overdue", "today", "tomorrow", "this_week", "later"];
  const groups = order
    .map((key) => ({ key, items: open.filter((i) => keyOf(i.dueOn) === key) }))
    .filter((g) => g.items.length > 0);
  const done = items
    .filter((i) => i.status === "done")
    .sort((a, b) => (a.dueOn === b.dueOn ? 0 : a.dueOn < b.dueOn ? 1 : -1));
  return { open: groups, done };
}
