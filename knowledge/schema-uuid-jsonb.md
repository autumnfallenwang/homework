---
name: schema-uuid-jsonb
description: homework's DB uses UUID string PKs and a jsonb raw_payloads.payload — NOT the source desktop app's integer ids / text blob. M03/M04/M06 must assume uuid strings + object payloads.
metadata:
  type: project
---

The Postgres schema (`apps/api/src/db/schema.ts`) intentionally diverges from the TeacherEase desktop app's SQLite schema in two ways (user decision in M02, to follow the homecal house pattern):

1. **UUID primary keys** (`uuid().primaryKey().defaultRandom()`) instead of integer autoincrement. Every id — `childId`, `fetchRunId`, `classId`, etc. — is a **uuid string**, not a `number`. When porting the desktop app's IPC contract into the HTTP API (M04) and the web client (M06), do NOT carry over the `number` id types; use `string`.
2. **`rawPayloads.payload` is `jsonb`** (column renamed from the source's `json`). Drizzle returns/accepts it as a parsed **object**, so M03's persist/read code stores the overview+classDetails object directly — no `JSON.stringify`/`JSON.parse` round-trip like the desktop app did.

TeacherEase's own upstream numeric ids (`teClassId`, `teCgpid`, `teAssignmentId`) remain `integer` — they're external identifiers, not our PKs.

`fetch_runs.status` is plain `text` (no DB CHECK); the `success|failed|parser_error` enum is enforced via Zod in shared/M04. Related: [[project-profile]].
