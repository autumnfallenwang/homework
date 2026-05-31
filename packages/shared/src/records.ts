// API request/response entity schemas. These are the shapes the HTTP API
// returns and the web (M06) imports. IDs are uuid strings (the M02 schema uses
// uuid PKs, not the desktop app's integer ids); timestamps are ISO strings.

import { z } from "zod";

// --- Read records (response bodies) ---

export const childRecordSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  portalType: z.string(),
  baseUrl: z.string(),
  username: z.string(),
  grade: z.string().nullable(),
  school: z.string().nullable(),
  homeworkUrl: z.string().nullable(),
  createdAt: z.string(),
});
export type ChildRecord = z.infer<typeof childRecordSchema>;

export const fetchRunStatusSchema = z.enum(["success", "failed", "parser_error"]);
export type FetchRunStatus = z.infer<typeof fetchRunStatusSchema>;

export const fetchRunRecordSchema = z.object({
  id: z.string().uuid(),
  childId: z.string().uuid(),
  source: z.string(),
  runAt: z.string(),
  status: fetchRunStatusSchema,
  durationMs: z.number().nullable(),
  errorMessage: z.string().nullable(),
});
export type FetchRunRecord = z.infer<typeof fetchRunRecordSchema>;

export const gradeRecordSchema = z.object({
  id: z.string().uuid(),
  fetchRunId: z.string().uuid(),
  classId: z.string().uuid().nullable(),
  className: z.string(),
  currentGrade: z.string().nullable(),
  status: z.string().nullable(),
  needsAttention: z.boolean(),
  targetsMeeting: z.number().nullable(),
  targetsNotMeeting: z.number().nullable(),
  targetsNotAssessed: z.number().nullable(),
});
export type GradeRecord = z.infer<typeof gradeRecordSchema>;

export const assignmentRecordSchema = z.object({
  id: z.string().uuid(),
  fetchRunId: z.string().uuid(),
  classId: z.string().uuid().nullable(),
  className: z.string(),
  assignmentName: z.string(),
  teAssignmentId: z.number().nullable(),
  name: z.string().nullable(),
  score: z.string().nullable(),
  scoreNumeric: z.number().nullable(),
  scoreLetter: z.string().nullable(),
  maxScore: z.string().nullable(),
  status: z.string().nullable(),
  dueDate: z.string().nullable(),
  weight: z.number().nullable(),
  isMissing: z.boolean(),
  feedback: z.string().nullable(),
});
export type AssignmentRecord = z.infer<typeof assignmentRecordSchema>;

export const classRecordSchema = z.object({
  id: z.string().uuid(),
  childId: z.string().uuid(),
  teClassId: z.number(),
  teCgpid: z.number(),
  name: z.string(),
  instructor: z.string().nullable(),
  gradingScale: z.string().nullable(),
  updatedAt: z.string(),
});
export type ClassRecord = z.infer<typeof classRecordSchema>;

export const homeworkRecordSchema = z.object({
  id: z.string().uuid(),
  childId: z.string().uuid(),
  hwDate: z.string(),
  subject: z.string(),
  content: z.string(),
  dueDate: z.string().nullable(),
  dueDateInferred: z.boolean(),
  scrapedAt: z.string(),
});
export type HomeworkRecord = z.infer<typeof homeworkRecordSchema>;

export const statusHistoryEntrySchema = z.object({
  status: z.string().nullable(),
  needsAttention: z.boolean(),
  runAt: z.string(),
});
export type StatusHistoryEntry = z.infer<typeof statusHistoryEntrySchema>;

export const homeworkMonthSchema = z.object({
  yearMonth: z.string(),
  count: z.number(),
});
export type HomeworkMonth = z.infer<typeof homeworkMonthSchema>;

// --- Request bodies ---

export const addChildSchema = z.object({
  displayName: z.string().min(1),
  baseUrl: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  grade: z.string().optional(),
  school: z.string().optional(),
  homeworkUrl: z.string().nullable().optional(),
});
export type AddChildInput = z.infer<typeof addChildSchema>;

// PATCH /children/:id — any subset of identity / password / homeworkUrl.
export const patchChildSchema = z
  .object({
    displayName: z.string().min(1).optional(),
    username: z.string().min(1).optional(),
    password: z.string().min(1).optional(),
    homeworkUrl: z.string().nullable().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "At least one field must be provided",
  });
export type PatchChildInput = z.infer<typeof patchChildSchema>;

export const settingValueSchema = z.object({ value: z.string() });
export type SettingValueInput = z.infer<typeof settingValueSchema>;

export const loginCheckSchema = z.object({
  baseUrl: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginCheckInput = z.infer<typeof loginCheckSchema>;

export const homeworkUrlCheckSchema = z.object({ url: z.string().min(1) });
export type HomeworkUrlCheckInput = z.infer<typeof homeworkUrlCheckSchema>;

// --- Query params ---

// Booleans arrive as strings on the query string; accept the common spellings.
const boolFlag = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1")
  .optional();

export const homeworkQuerySchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
  })
  .refine((q) => !(q.date && q.month), { message: "Provide either date or month, not both" });
export type HomeworkQuery = z.infer<typeof homeworkQuerySchema>;

export const fetchRunsQuerySchema = z.object({
  latest: boolFlag,
  successful: boolFlag,
  source: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
});
export type FetchRunsQuery = z.infer<typeof fetchRunsQuerySchema>;

export const statusHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().default(5),
});
export type StatusHistoryQuery = z.infer<typeof statusHistoryQuerySchema>;
