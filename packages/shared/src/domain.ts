// Cross-cutting domain payload types — the shapes the TeacherEase scraper
// produces and the attention engine consumes. Moved here from the api's
// scraper/types.ts so both the API and the web (M06) — and the attention
// engine — share one definition without depending on apps/api.
//
// Each shape is a Zod schema + an inferred type. `readonly` is intentionally
// dropped (z.infer yields mutable types); these objects are built once by the
// parser and only ever read afterwards, so mutability is harmless here.

import { z } from "zod";

// --- Grades overview (the GradeViewAllWithProgress page) ---

export const classOverviewSchema = z.object({
  name: z.string(),
  instructor: z.string(),
  status: z.enum(["meeting", "needs_attention", "not_assessed"]),
  statusCode: z.number(),
  needsAttention: z.boolean(),
  targetsMeeting: z.number(),
  targetsNotMeeting: z.number(),
  totalTargets: z.number(),
  classId: z.number(),
  cgpId: z.number(),
});
export type ClassOverview = z.infer<typeof classOverviewSchema>;

export const gradesOverviewSchema = z.object({
  classes: z.array(classOverviewSchema),
  summary: z.object({
    totalClasses: z.number(),
    meetingExpectations: z.number(),
    needsAttention: z.number(),
    notAssessed: z.number(),
    totalTargetsMeeting: z.number(),
    totalTargetsNotMeeting: z.number(),
  }),
});
export type GradesOverview = z.infer<typeof gradesOverviewSchema>;

// --- Class detail (StudentProgressStandardsDetails page) ---

export const assignmentSchema = z.object({
  testNameId: z.number(),
  dueDate: z.string(),
  name: z.string(),
  weight: z.string(),
  grade: z.string(),
  gradeNumeric: z.number(),
  gradeLetter: z.string(),
  isMissing: z.boolean(),
  feedback: z.string(),
});
export type Assignment = z.infer<typeof assignmentSchema>;

// Standards are a recursive tree, so the interface is hand-written and the
// schema is z.lazy + an explicit ZodType annotation.
export interface Standard {
  name: string;
  score: string;
  scoreNumeric: number;
  scoreLetter: string;
  isMeeting: boolean;
  children: Standard[];
  assignments: Assignment[];
  missingCount: number;
  lowScoreCount: number;
}

export const standardSchema: z.ZodType<Standard> = z.lazy(() =>
  z.object({
    name: z.string(),
    score: z.string(),
    scoreNumeric: z.number(),
    scoreLetter: z.string(),
    isMeeting: z.boolean(),
    children: z.array(standardSchema),
    assignments: z.array(assignmentSchema),
    missingCount: z.number(),
    lowScoreCount: z.number(),
  }),
);

export const classDetailsSchema = z.object({
  className: z.string(),
  standards: z.array(standardSchema),
  summary: z.object({
    missingAssignments: z.number(),
  }),
});
export type ClassDetails = z.infer<typeof classDetailsSchema>;

// --- Homework (Google Sites daily homework page) ---

export const homeworkSubjectSchema = z.object({
  name: z.string(),
  content: z.string(),
  dueDate: z.string().nullable(),
});
export type HomeworkSubject = z.infer<typeof homeworkSubjectSchema>;

export const homeworkEntrySchema = z.object({
  date: z.string(),
  subjects: z.array(homeworkSubjectSchema),
});
export type HomeworkEntry = z.infer<typeof homeworkEntrySchema>;
