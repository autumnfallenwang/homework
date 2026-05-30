---
name: drizzle-casing-onconflict
description: Set casing "snake_case" on BOTH drizzle.config.ts and drizzle() — without it, onConflictDoUpdate emits snake_case targets that don't match camelCase DDL, so upserts throw duplicate-key.
metadata:
  type: feedback
---

The Drizzle setup pins `casing: "snake_case"` in **two** places that must agree:
`apps/api/drizzle.config.ts` (drives `drizzle-kit generate`) and the `drizzle()`
client in `apps/api/src/db/index.ts` (drives runtime SQL). Test files that build
their own client must pass it too.

**Why:** With no `casing` set, `drizzle-kit` generated **camelCase** columns
(`"childId"`) but `drizzle-orm`'s runtime `.onConflictDoUpdate({ target: [...] })`
emitted **snake_case** (`ON CONFLICT ("child_id","te_class_id")`). Postgres
couldn't match that to the camelCase unique index, so the `ON CONFLICT` did
nothing and the second upsert threw `duplicate key value violates unique
constraint "classes_child_te_class_unique"`. The class/homework upserts in the
fetch pipeline silently broke on any re-run. Setting `casing: "snake_case"`
everywhere makes DDL + runtime SQL agree (and matches the source SQLite schema).

**How to apply:** Keep `casing: "snake_case"` in both configs. After changing it,
`rm -rf apps/api/drizzle && drizzle-kit generate --name init < /dev/null`, then
`DROP SCHEMA public CASCADE; CREATE SCHEMA public;` + `db:migrate` to rebuild.
Verify a re-run upsert keeps row counts stable (the M03 run-fetch integration
test covers this). `getTableConfig().columns[].name` still returns the JS name,
so structural schema tests assert camelCase. Related: [[schema-uuid-jsonb]],
[[drizzle-kit-generate-prompt]].
