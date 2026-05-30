---
name: 02-data-model
status: todo
created: 2026-05-30
---

# Milestone 02 — Data model & database

Port the desktop app's SQLite schema (9 tables, evolved across 7 migrations) to a Drizzle + Postgres schema, with a migration workflow that works in dev and in-cluster.

## Goal

A single `apps/api/src/db/schema.ts` defines all tables; `pnpm --filter @homework/api db:generate` + `db:migrate` apply cleanly to the local Postgres from M01; the API can read/write every table through the typed Drizzle client.

## Scope / deliverables

`apps/api/src/db/`:
- `index.ts` — postgres client from `DATABASE_URL`, exports `db` + `Database` type
- `schema.ts` — all 9 tables (below)
- `drizzle/` — generated SQL migrations (committed)
- `seed-settings.ts` — insert default settings rows (idempotent), auto-run at API boot

Root: `apps/api/drizzle.config.ts`, package scripts `db:generate`, `db:migrate`, `db:studio`, `db:seed:settings`.

### Tables to port (from `src-tauri/src/migrations.rs`)

Translate SQLite types → Postgres (INTEGER PK → `serial`/`identity`, TEXT timestamps → `timestamptz` with defaults, INTEGER bool flags → `boolean`, FKs with `on delete cascade`):

1. **children** — id, display_name, portal_type (default 'teacherease'), base_url, username, **portal_password** (plaintext, see Decisions), grade, school, homework_url, created_at
2. **settings** — key (PK), value, updated_at  *(key-value store)*
3. **fetch_runs** — id, child_id (FK→children cascade), run_at, status (`success|failed|parser_error`), duration_ms, error_message, source (default 'teacherease')
4. **raw_payloads** — fetch_run_id (PK, FK→fetch_runs), json  *(full serialized overview + classDetails)*
5. **classes** — id, child_id (FK cascade), te_class_id, te_cgpid, name, instructor, grading_scale, updated_at; **unique(child_id, te_class_id)**
6. **grades** — id, fetch_run_id (FK), class_id (FK), class_name, current_grade, status, needs_attention (bool), targets_meeting, targets_not_meeting, targets_not_assessed
7. **assignments** — id, fetch_run_id (FK), class_id (FK), class_name, assignment_name, te_assignment_id, name, score, score_numeric (real), score_letter, max_score, status, due_date, weight, is_missing (bool), feedback
8. **standards** — id, fetch_run_id (FK), class_id (FK), parent_id (self-FK, hierarchical), name, score_numeric (real), score_letter, is_meeting (bool)
9. **homework** — id, child_id (FK cascade), hw_date, subject, content, due_date, due_date_inferred (bool), scraped_at; **unique(child_id, hw_date, subject)**

## Exit criteria

- [ ] `db:generate` produces migrations; `db:migrate` applies to a fresh local DB with no errors
- [ ] All 9 tables + the two unique constraints + all FK cascades exist (verify in `db:studio` / `psql`)
- [ ] `seed-settings.ts` inserts defaults idempotently (re-running is a no-op)
- [ ] A throwaway smoke test inserts a child → fetch_run → grades and reads them back through Drizzle
- [ ] Drizzle types for every table are exported and importable

## Decisions (locked)

- **Credentials at rest:** `children.portal_password` and the `smtp.password` setting are **plaintext** in Postgres — 1:1 with the desktop app, acceptable for LAN-only single-user. Hardening (app-level AES) is explicitly deferred to a future milestone, NOT this one.
- **Drop dormant keychain path entirely** — no `keychain_*` equivalent. Passwords live only in the DB.
- **Migrations baked into the API image** (homecal style) so the in-cluster pre-install Job can run them (wired in M07).
- **Default settings to seed:** all the keys the desktop app uses — `attention.forgivenessWeeks=2`, `attention.lowScoreThreshold=3.0`, `fetch.runsPerDay=3`, `fetch.firstSlotAt=09:00`, `fetch.weekdaysOnly=0`, `notify.runsPerDay=2`, `notify.firstSlotAt=08:00`, `notify.weekdaysOnly=0`, `notify.fetchBeforeDispatch=1`, `notify.catchupOnMiss=1`, `notify.refreshDigest.email=0`, smtp.* empty. (Drop `notify.refreshDigest.os`, `appearance.*` for autostart/updater — see feature cuts in M06.)

## Open questions

- **Settings scope:** the desktop app's `settings` table is global (single user). Keep it global for the 1:1 port. If multi-user ever lands (future), settings + children get a `user_id` — out of scope now. Confirm global is fine. *(Assumed yes.)*
- **`ui.selectedChildId`** was a per-install UI preference. In a web app this is arguably per-browser, not server state — defer the call to M06 (could live in localStorage instead of the settings table).

## References

- Source schema: `teacherease-parent-companion/src-tauri/src/migrations.rs` (v1–v7)
- Drizzle setup blueprint: `homecal/apps/api/src/db/`, `homecal/deploy/chart/templates/job-migrate.yaml`
- Depends on: M01 (db client, local Postgres)
