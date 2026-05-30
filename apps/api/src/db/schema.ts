import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// Ported from the TeacherEase Parent Companion desktop app's SQLite schema
// (src-tauri/src/migrations.rs, v1–v7). Two intentional divergences from a
// strict 1:1 port, per project decision: UUID primary keys (not integer
// autoincrement) and `raw_payloads.payload` as jsonb (not a text blob).
// TeacherEase's own numeric ids (te_class_id, te_cgpid, te_assignment_id)
// stay integer — they're upstream identifiers, not our PKs.

export const children = pgTable("children", {
  id: uuid().primaryKey().defaultRandom(),
  displayName: text().notNull(),
  portalType: text().notNull().default("teacherease"),
  baseUrl: text().notNull(),
  username: text().notNull(),
  // Plaintext per the locked M02 decision (LAN-only, single-user). App-level
  // encryption is deferred to a future milestone.
  portalPassword: text(),
  grade: text(),
  school: text(),
  homeworkUrl: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// Global key-value store (single-user; no per-user scope).
export const settings = pgTable("settings", {
  key: text().primaryKey(),
  value: text().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const fetchRuns = pgTable(
  "fetch_runs",
  {
    id: uuid().primaryKey().defaultRandom(),
    childId: uuid()
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    runAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // 'success' | 'failed' | 'parser_error' — enforced app-level via Zod (M04),
    // matching homecal's no-DB-enums convention.
    status: text().notNull(),
    durationMs: integer(),
    errorMessage: text(),
    source: text().notNull().default("teacherease"),
  },
  (table) => [
    index("fetch_runs_child_run_idx").on(table.childId, table.runAt),
    index("fetch_runs_child_source_run_idx").on(table.childId, table.source, table.runAt),
  ],
);

// 1:1 with fetch_runs — the PK is the FK. Stores the full serialized
// grades-overview + class-details blob (jsonb).
export const rawPayloads = pgTable("raw_payloads", {
  fetchRunId: uuid()
    .primaryKey()
    .references(() => fetchRuns.id, { onDelete: "cascade" }),
  payload: jsonb().notNull(),
});

export const classes = pgTable(
  "classes",
  {
    id: uuid().primaryKey().defaultRandom(),
    childId: uuid()
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    teClassId: integer().notNull(),
    teCgpid: integer().notNull(),
    name: text().notNull(),
    instructor: text(),
    gradingScale: text(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("classes_child_idx").on(table.childId),
    unique("classes_child_te_class_unique").on(table.childId, table.teClassId),
  ],
);

export const standards = pgTable(
  "standards",
  {
    id: uuid().primaryKey().defaultRandom(),
    fetchRunId: uuid()
      .notNull()
      .references(() => fetchRuns.id, { onDelete: "cascade" }),
    classId: uuid().references(() => classes.id, { onDelete: "set null" }),
    // Self-reference for the hierarchical standards tree.
    parentId: uuid().references((): AnyPgColumn => standards.id, { onDelete: "cascade" }),
    name: text().notNull(),
    scoreNumeric: doublePrecision(),
    scoreLetter: text(),
    isMeeting: boolean(),
  },
  (table) => [
    index("standards_fetch_run_idx").on(table.fetchRunId),
    index("standards_class_fetch_run_idx").on(table.classId, table.fetchRunId),
  ],
);

export const grades = pgTable(
  "grades",
  {
    id: uuid().primaryKey().defaultRandom(),
    fetchRunId: uuid()
      .notNull()
      .references(() => fetchRuns.id, { onDelete: "cascade" }),
    classId: uuid().references(() => classes.id, { onDelete: "set null" }),
    className: text().notNull(),
    currentGrade: text(),
    status: text(),
    needsAttention: boolean().notNull().default(false),
    targetsMeeting: integer(),
    targetsNotMeeting: integer(),
    targetsNotAssessed: integer(),
  },
  (table) => [index("grades_fetch_run_idx").on(table.fetchRunId)],
);

export const assignments = pgTable(
  "assignments",
  {
    id: uuid().primaryKey().defaultRandom(),
    fetchRunId: uuid()
      .notNull()
      .references(() => fetchRuns.id, { onDelete: "cascade" }),
    classId: uuid().references(() => classes.id, { onDelete: "set null" }),
    className: text().notNull(),
    assignmentName: text().notNull(),
    teAssignmentId: integer(),
    name: text(),
    score: text(),
    scoreNumeric: doublePrecision(),
    scoreLetter: text(),
    maxScore: text(),
    status: text(),
    dueDate: text(),
    weight: integer(),
    isMissing: boolean().notNull().default(false),
    feedback: text(),
  },
  (table) => [index("assignments_fetch_run_idx").on(table.fetchRunId)],
);

export const homework = pgTable(
  "homework",
  {
    id: uuid().primaryKey().defaultRandom(),
    childId: uuid()
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    hwDate: text().notNull(),
    subject: text().notNull(),
    content: text().notNull(),
    dueDate: text(),
    dueDateInferred: boolean().notNull().default(false),
    scrapedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("homework_child_date_idx").on(table.childId, table.hwDate),
    unique("homework_child_date_subject_unique").on(table.childId, table.hwDate, table.subject),
  ],
);

// Relations — used by the Drizzle relational query builder in M04.

export const childrenRelations = relations(children, ({ many }) => ({
  fetchRuns: many(fetchRuns),
  classes: many(classes),
  homework: many(homework),
}));

export const fetchRunsRelations = relations(fetchRuns, ({ one, many }) => ({
  child: one(children, { fields: [fetchRuns.childId], references: [children.id] }),
  rawPayload: one(rawPayloads, {
    fields: [fetchRuns.id],
    references: [rawPayloads.fetchRunId],
  }),
  grades: many(grades),
  assignments: many(assignments),
  standards: many(standards),
}));

export const rawPayloadsRelations = relations(rawPayloads, ({ one }) => ({
  fetchRun: one(fetchRuns, {
    fields: [rawPayloads.fetchRunId],
    references: [fetchRuns.id],
  }),
}));

export const classesRelations = relations(classes, ({ one, many }) => ({
  child: one(children, { fields: [classes.childId], references: [children.id] }),
  grades: many(grades),
  assignments: many(assignments),
  standards: many(standards),
}));

export const standardsRelations = relations(standards, ({ one, many }) => ({
  fetchRun: one(fetchRuns, { fields: [standards.fetchRunId], references: [fetchRuns.id] }),
  class: one(classes, { fields: [standards.classId], references: [classes.id] }),
  parent: one(standards, {
    fields: [standards.parentId],
    references: [standards.id],
    relationName: "standard_parent",
  }),
  children: many(standards, { relationName: "standard_parent" }),
}));

export const gradesRelations = relations(grades, ({ one }) => ({
  fetchRun: one(fetchRuns, { fields: [grades.fetchRunId], references: [fetchRuns.id] }),
  class: one(classes, { fields: [grades.classId], references: [classes.id] }),
}));

export const assignmentsRelations = relations(assignments, ({ one }) => ({
  fetchRun: one(fetchRuns, { fields: [assignments.fetchRunId], references: [fetchRuns.id] }),
  class: one(classes, { fields: [assignments.classId], references: [classes.id] }),
}));

export const homeworkRelations = relations(homework, ({ one }) => ({
  child: one(children, { fields: [homework.childId], references: [children.id] }),
}));
