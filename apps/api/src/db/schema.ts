import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
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

// ─── Logins (ADR 0004) ──────────────────────────────────────────────────────
// Better Auth's core tables, shaped as in homecal / homeparentcontrol
// (`usePlural`, Postgres-generated uuids). A LOGIN is not a PROFILE: the
// student profile stays `children` (with the parent's TeacherEase login);
// a child's login points at it through `users.child_id`.

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    // Required by Better Auth; a child's login gets a placeholder never shown.
    email: text().notNull().unique(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    // username plugin — how a child signs in.
    username: text().unique(),
    displayUsername: text(),
    // 'parent' | 'child'. A Better Auth additional field that no request can
    // set (`input: false`); the CHECK below ties a child to a profile.
    role: text().notNull().default("child"),
    // The link to the student profile. Set from an invite row, never from a
    // request. Deleting the profile removes the child's login with it.
    childId: uuid().references(() => children.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One login per profile.
    unique("users_child_id_unique").on(table.childId),
    check(
      "users_child_role_has_child",
      sql`${table.role} <> 'child' OR ${table.childId} IS NOT NULL`,
    ),
  ],
);

export const sessions = pgTable("sessions", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text().notNull().unique(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  ipAddress: text(),
  userAgent: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text().notNull(),
  providerId: text().notNull(),
  accessToken: text(),
  refreshToken: text(),
  accessTokenExpiresAt: timestamp({ withTimezone: true }),
  refreshTokenExpiresAt: timestamp({ withTimezone: true }),
  scope: text(),
  idToken: text(),
  // The password HASH lives here, not on `users`.
  password: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const verifications = pgTable("verifications", {
  id: uuid().primaryKey().defaultRandom(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// One-time links a parent hands to a child: 'join' creates the child's login for
// `child_id`, 'reset' sets a new password on it. Only the SHA-256 of the
// token is stored (ADR 0004).
export const invites = pgTable(
  "invites",
  {
    id: uuid().primaryKey().defaultRandom(),
    childId: uuid()
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    purpose: text().notNull(), // 'join' | 'reset' — Zod-enforced
    tokenHash: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    usedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("invites_child_idx").on(table.childId)],
);

// Relations — used by the Drizzle relational query builder in M04.

export const childrenRelations = relations(children, ({ many }) => ({
  fetchRuns: many(fetchRuns),
  classes: many(classes),
  homework: many(homework),
  logins: many(users),
  invites: many(invites),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  child: one(children, { fields: [users.childId], references: [children.id] }),
  sessions: many(sessions),
  accounts: many(accounts),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const invitesRelations = relations(invites, ({ one }) => ({
  child: one(children, { fields: [invites.childId], references: [children.id] }),
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
