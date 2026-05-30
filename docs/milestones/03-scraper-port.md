---
name: 03-scraper-port
status: todo
created: 2026-05-30
---

# Milestone 03 — Scraper & fetch pipeline

Move the TeacherEase scraping + fetch orchestration into `apps/api`. The good news: the scraper is **already pure TypeScript** (cheerio), so this is mostly relocation + swapping the HTTP transport, not a rewrite. The Rust shell only provided the HTTP client and the DB; both now live server-side.

## Goal

Given a child's credentials, the API can log into TeacherEase, fetch grades + class details + (optional) homework, parse them with the existing cheerio parsers, and persist a complete `fetch_run` with all child rows — invokable as a single internal function `runFetch(childId)`.

## Scope / deliverables

Relocate from `teacherease-parent-companion/src/lib/` into `apps/api/src/scraper/` and `apps/api/src/fetch/`:
- `scraper/teacherease.ts` — login flow (GET `/common/login.aspx` → extract hidden fields → POST `/app/Login/Login` → detect redirect/`badCredentials`). Returns `Session { baseUrl, cookieHeader }`.
- `scraper/parser.ts` — `parseGradesOverview()` (regex-extract embedded JSON blob) + `parseClassDetails()` (cheerio standards tree + assignments)
- `scraper/homework-parser.ts` — `parseHomework()` (Google Sites HTML → dated subject entries)
- `scraper/types.ts` — domain types (Session, GradesOverview, ClassDetails, Standard, Assignment, HomeworkEntry, LoginError)
- `fetch/teacherease-source.ts`, `fetch/homework-source.ts`, `fetch/runner.ts` — orchestration

Transport swap:
- Replace Tauri `plugin-http` / `tauriFetch` with **Node `fetch` (undici)** + manual cookie handling. Keep the `TeacherEaseParentCompanion/x.y` User-Agent.
- Pages fetched (unchanged): grades = GET `/App/Parents/StandardGrade/GradeViewAllWithProgress`; class details = GET `/common/StudentProgressStandardsDetails.aspx?ClassID={id}&CGPID={cgpId}`; homework = GET user-provided URL.

Persistence (port `ipc.ts` persist methods → Drizzle):
- `startFetchRun(childId, source)` → insert fetch_runs, return id
- `persistTeacherEaseData(fetchRunId, overview, classDetails[])` → raw_payloads JSON, upsert classes (on `unique(child_id, te_class_id)`), insert grades/standards/deduped assignments
- `persistHomework(childId, entries)` → upsert homework (on `unique(child_id, hw_date, subject)`)
- `completeFetchRun(id, {status, durationMs, errorMessage})`

Top-level: `runFetch(childId)` ties login → sources → persist → complete, with error classification (`failed` vs `parser_error`).

## Exit criteria

- [ ] Unit tests for parsers using **saved HTML fixtures** (scrub real data → fixtures under `apps/api/test/fixtures/`). Cover: grades overview JSON extraction, class-details standards tree, missing-assignment detection, homework date/subject parsing.
- [ ] `runFetch(childId)` writes a complete fetch_run graph to Postgres (verified against a fixture-backed mock transport)
- [ ] Login failure raises a typed `badCredentials` error; parser failure → `parser_error` status (not `failed`)
- [ ] Assignment dedup + class upsert behave correctly on a second run (no duplicate rows)
- [ ] No `@tauri-apps/*` imports remain in the ported code

## Decisions (locked)

- **Reuse the existing cheerio parsers verbatim** where possible — they're pure and already battle-tested. Only the transport layer changes.
- **Cookie handling:** manual `Set-Cookie` → `Cookie` header threading (the source already models `Session.cookieHeader`); no cookie-jar dependency needed for the simple flow.

## Open questions

- **Live integration test gating:** the source had `TEACHEREASE_LIVE=0` env gating for tests that hit the real portal. Recommend keeping the same pattern (skipped in CI, opt-in locally). Need a scrubbed real-portal HTML fixture to seed parser tests — **can you provide a saved-HTML sample, or should the parser tests rely only on the fixtures already in the source repo's `tests/`?**
- **Subject list for homework parsing** is currently hardcoded (`["Science","World Geography","English","Math"]`) — that's child/school-specific. Keep hardcoded for the 1:1 port, or make it a per-child setting? *(Recommend: keep hardcoded now, note as future config.)*
- **Concurrency:** fetch all children sequentially (desktop behavior) or in parallel? Recommend sequential for the port; revisit if slow.

## References

- Source scraper: `teacherease-parent-companion/src/lib/scraper/` and `src/lib/fetch/`
- Source persistence: `src/lib/ipc.ts` (`persistTeacherEaseData`, `persistHomework`, fetch-run lifecycle)
- Existing tests/fixtures: `teacherease-parent-companion/tests/`
- Depends on: M02 (schema + Drizzle client)
