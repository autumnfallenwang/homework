---
name: 13-homework-grading
status: in-progress
created: 2026-11-10
---

# Milestone 13 — Homework grading (stage 4, parent side)

Every homework submission is graded by a vision model through llmgw. The parent gets an email
only when the grade says they are needed, or when a photo must be retaken — and a retake request
also shows to the child on her item. Every grade lands in the existing daily digest
([ADR 0014](../adr/0014-homework-graded-by-an-llm.md)). Matching grades to the teacher's grades in
TeacherEase is the next milestone ([14](14-teacher-grade-matching.md)).

## Goal

Ivy submits her Oct 26 math packet with 9 photos and the note "IDK how to do the last page".
About two minutes later the parent gets an email: *Ivy · Mathematics 8 Honors · packet — 58/100,
needs you*, listing "photo 7, Q3: reflected over y = x by flipping both signs, (−1, 5) → (1, −5);
a reflection over y = x swaps the coordinates, (5, −1)" and "she says she's stuck on the last
page". Her English reflection grades 90 — no email; it shows up in the 15:15 digest. Her Science
study guide has a blurry photo: her item says *Retake photo — photo 2 is too blurry to read. Take
it again in good light, then Submit*, the parent gets the same in an email, and her new Submit is
graded again.

## Real data this is built on (cluster, 2026-11-10)

- 23 items (Oct 4 – Nov 2), all submitted (25 Submits — re-submits are rare), all with a note;
  58 solution photos, 7 sheet photos, ~135 KB each, 1600 px — legible, worksheets carry their
  printed questions.
- Math packets: 4–9 photos each — where grading pays most. 6 items are "on computer" with no
  photos → `not_gradable`.
- Digest: weekdays at 15:15 (`notify.runsPerDay` 1). TeacherEase fetch: 07:00 / 15:00 / 23:00.

## When the model runs

| Job | When | Model call |
|---|---|---|
| Grade a submission | a sweep **every minute** picks submissions that have no grade and were submitted ≥ 1 minute ago; one at a time | vision, ~30–90 s |
| Retry a failed grade | 5 min, 30 min, 2 h later (3 tries per submission), the fallback model inside each try | same |
| Grade again (parent button) | the next sweep | same |
| Daily digest | 15:15 weekdays, as today | none — reads stored grades |

- **As soon as possible**, because the two outcomes are only useful that evening: a retake while
  she still has the paper (most items are due the next day), a low grade while the parent can
  still help before hand-in.
- **Not inside Submit**: her Submit stays instant and never fails because llmgw is slow or down.
- **The database is the queue** (a submission with no grade row = waiting), not memory: the API
  pod has restarted 14 times in 36 days, and a one-query-a-minute sweep survives that with no new
  infrastructure. Single API replica + an in-process mutex = never two grades at once.
- **The 1-minute settle** keeps the grader off a submission she is about to replace (Submit, then
  add one more photo, Submit again).
- **Usage:** 1–3 submissions a day ≈ 1–3 vision calls. llmgw's Claude models run on the family's
  Claude subscription (the same usage window as the founder's own Claude use); when that window
  is exhausted the fallback `gpt-6-luna` (ChatGPT login) grades instead.

## Scope / deliverables

### Phase 0 — Calibrate on the real 23 items (before any app code)

- `apps/api/src/scripts/grade-dry-run.ts`: reads the real items + photos through a port-forward
  (read only, no writes), grades each through llmgw with the draft prompt, writes an HTML report
  to the scratchpad: score / status / summary / findings / retake reason next to the photos.
- Run it with `claude-sonnet-5-5`, `claude-opus-5-5` and `qwen3-vl:8b` as a baseline. The founder
  and I read the report together; tune the prompt and pick the default model and alert threshold.
- Check llmgw takes the largest request (9 photos ≈ 1.6 MB base64; the cap is 20 + 20 photos
  ≈ 7 MB).

### Phase 1 — Data and settings

- Migration `0008_homework_grades`: `homework_grades` — `item_id` (FK, cascade), `submitted_at`
  (the submission graded), `status` (CHECK `graded | retake | not_gradable | failed`), `score`
  (0–100, set iff graded, CHECK), `summary`, `findings` jsonb (`[{ photo, question, problem, fix }]`),
  `stuck`, `retake_reason` (written for the child, photos only), `retake_photos` jsonb,
  `sheet_title` (the title printed on the sheet, if visible — M14 matches on it), `photo_ids`
  jsonb (what the model saw), `model`, `prompt_version`, `attempt`, `duration_ms`, `usage` jsonb,
  `error`, `requested_by` (parent Grade again), `alerted_at`, `reported_at`, `created_at`.
  Index `(item_id, created_at)`.
- Settings keys (seeded, `settings` KV): `grading.enabled` (`0`), `grading.enabledAt`,
  `grading.model` (`claude-sonnet-5-5`), `grading.fallbackModel` (`gpt-6-luna`),
  `grading.alertBelow` (`80`), `grading.instructions` (`""` — extra words for the grader, e.g.
  "8th grade, Honors math: she must show her work").
- `GET /api/grading/models` (parent): llmgw `/v1/models` filtered to `status: ok` and
  `input` ∋ `image`.
- Web: **Settings → Grading** tab (parent only): On / off, Model, Fallback model (selects from the
  endpoint; a saved model that vanished stays shown, marked unavailable), Alert below (0–100),
  Extra instructions, Save. A note when SMTP isn't set up ("alerts need Notifications set up").
- `LLM_GATEWAY_URL` in `config.ts` + chart `values.yaml` (`http://llmgw.llmgw.svc.cluster.local`).

### Phase 2 — The grader and the sweep

- `lib/llm.ts`: plain `fetch` + Zod against `${LLM_GATEWAY_URL}/v1` (chat completions with tools and
  images, the model list), 180 s timeout — no SDK for two calls.
- `services/grading.ts`:
  - `buildGradingRequest(item, photos, settings)` — system prompt (grader role; rubric:
    correctness and completeness of what is visible; the note is context, not graded; never invent
    questions; say so when unsure; grade what can be seen; a retake request — with any status — only
    for answers that can't be checked in any photo or a missing page, written to the child, about
    the photo only; English), user content =
    class, type, title, details, given / due, the note, then the images labelled
    "Sheet photo 1…", "Solution photo 1…" (active photos only, in the order her page shows them).
  - One tool, `record_grade`, with a JSON schema; `tool_choice` forces it (llmgw asks in words where
    the model can't be forced — Sonnet 5.5 always thinks). Zod-parse the arguments; one retry on
    bad output, then the fallback model, then `failed`.
  - No photos and nothing to look at → `not_gradable` without calling the model.
  - `GRADING_PROMPT_VERSION` stored on every row.
- Sweep (`scheduler.ts`, `* * * * *`, armed only when `grading.enabled`): items of children with
  `homework_source = child` whose current `submitted_at` is ≥ 1 minute old, after
  `grading.enabledAt`, with no grade row — or only `failed` rows, fewer than 3, the last one older
  than its backoff (5 min / 30 min / 2 h). Oldest first, one at a time.
- Re-grading: a new Submit (e.g. after a retake) is a new `submitted_at` → graded again. Edits
  without a new Submit are not re-graded. Parent `POST /api/homework-items/:id/grade` → 202, grades
  the current submission again (the page polls).
- Logs (ADR 0003): `grading.done` (item_id, status, score, model, prompt_version, duration_ms),
  `grading.failed` (attempt, error), `grading.sweep` (picked, waiting). No photo bytes, no note text.

### Phase 3 — Emails

- **Alert** (`renderGradeAlert`, same `loadSmtpConfig` + `sendEmail`): sent right after a grade with
  `score < grading.alertBelow` — low scores only (founder, 2026-11-11; a retake request alone goes
  to the child in the app and to the parent in the digest); once per grade (`alerted_at`); never
  for the parent's own Grade again or the backfill. Subjects
  `Ivy · Mathematics 8 Honors · packet — 58/100, needs you` / `… — retake the photo`; body: summary,
  findings, the stuck flag, a link to the item page (web origin = first `CORS_ORIGINS`). SMTP
  missing → `grading.alert.skip` log line; the grade still goes to the digest.
- **Daily digest**: a "Homework grades" section per child — every grade since the last digest
  (`reported_at` null): class, title, score or Retake / Not checked / Couldn't grade, summary, ⚑ on
  the ones already alerted. `reported_at` set after the send. Omitted when grading is off.

### Phase 4 — Screens

- Parent Review list (`HomeworkList`): a chip per row — the score (red below the threshold),
  `Retake`, `Not checked`, `Grading…`, `Couldn't grade`.
- Parent item page: a **Grade** panel above the history — score, summary, findings (the photo
  number opens that photo in the lightbox), stuck flag, model + time, **Grade again**; older grades
  folded underneath.
- **Child** (the retake request only — never a score, summary or finding): her list shows a
  `Retake photo` chip; her item page shows a banner with the reason and the photo numbers
  (outlined in her photo grid) until she submits again. Right after a Submit the page says
  "Checking your photos…" and refreshes while it stays open (up to 5 minutes). The child API
  returns `{ retake: { reason, photos } | null, checking }` and nothing else from the grade.

### Phase 5 — Release

- Deploy with grading off. Backfill the 23 existing items silently
  (`scripts/grade-backfill.ts --no-alerts`, no child retake banners), then turn it on in Settings.
- Watch the first real submission end to end: grade row, alert or no alert as the threshold says,
  a retake banner if one is asked for, the next 15:15 digest section, Loki lines (`grading.*`),
  llmgw `/v1/limits` after a week.

## Exit criteria

- [x] Phase 0 report read; prompt, default model and threshold set (the Oct 26 y = x error is found
  by both Claude models; the "on computer" items are `not_gradable`). The founder asked for the
  whole run end to end, so the agent made the calls — see Progress.
- [x] lint, typecheck, unit tests: prompt builder (labels, order, removed photos left out), output
  parsing (bad output → retry → fallback → failed), alert rule (threshold edges, retake,
  not_gradable and failed never alert), backoff, alert email rendering.
- [x] Integration tests (live Postgres, `homework_test`) with an injected grader: the sweep picks
  settled new submissions, re-submits, failed retries with backoff up to 3, skips items submitted
  before `enabledAt` and `page`-source children; one alert per grade; digest sets `reported_at`;
  parent routes; child routes return the retake request and never the score or findings;
  Grade again; settings; quiet backfill (11 tests).
- [ ] ~~Opt-in live test (`GRADING_LIVE=1`)~~ — replaced by the Phase 0 dry run and the dev e2e
  below, which call the real llmgw with real photos.
- [x] Dev end to end (Docker Postgres with a copy of the real data + Mailpit + the real llmgw, UI
  driven in a browser): grading switched on in Settings → Grading; the child submits a blurred
  photo → "Checking your photos…" → ~1.5 min later the retake banner with the photo outlined, no
  score → the parent's "retake the photos" email; she swaps in a clear photo and submits → 80/100
  with a smaller retake request → second email; parent Review chips, the Grade panel with
  findings linked to photos, Grade again (no email, attributed to the parent); digest section;
  the backfill graded 23 items with no email.
- [ ] Released: backfill done, grading on, first real submission graded and emailed as expected.
## Decisions

- **Founder, 2026-11-10 (round 1):** grades (not just sorting) from llmgw; email based on the grade,
  and a retake email when the photos can't show the work; the report is the existing daily digest;
  photos to cloud models are fine; the agent picks what each grade contains.
- **Founder, 2026-11-10 (round 2):** the retake request also shows to the child (the grade itself
  still doesn't); no action on days with nothing submitted; match grades to the teacher's grades
  if it can be done (→ M14); weekly summary later; the agent picks the timing (→ "When the model
  runs").
- **Founder, 2026-11-11:** email for low scores only; retake requests stay in the app (the child)
  and the daily digest (the parent).
- Defaults (agent, to confirm in Phase 0): score 0–100, alert below 80, `claude-sonnet-5-5`,
  fallback `gpt-6-luna`, 1-minute sweep with a 1-minute settle.

## Open questions (not blocking — default in brackets)

1. Email the retake request to the child too? [in the app only; the parent's email covers the
   evening she doesn't open it]
2. A weekly summary email (patterns across items)? [later]

## Progress

- 2026-11-10: planned from the real data (23 items) — ADR 0014 proposed. Round 2: child retake
  banner, timing, M14 split out.
- 2026-11-10: built (founder: "go all the way e2e for all M13 and M14"). Phase 0 on the 23 real
  items (copied read-only into a local DB through the db pod — the cluster DB password never left
  the cluster):
  - prompt v1 "retake OR grade" asked for a retake on the Oct 26 packet and graded nothing; changed
    to "grade what you can see, plus a retake request for what you can't" — both Claude models then
    found the y = x reflection error, a 1b order-of-operations slip and a table/graph mismatch.
  - Sonnet 5.5: 15 graded / 7 not gradable / 1 retake, 5 below 80, ~17 s avg. Opus 5.5: within a
    few points, 3 below 80, ~24 s avg. qwen3-vl:8b: 6 failed, 2–5 min each, a 100 for a three-word
    note. → `claude-sonnet-5-5`, fallback `gpt-6-luna`, alert below 80 (≈ 2 alerts a week on this
    month's data, most of them math packets photographed with the top of the page cut off).
  - prompt v2: retake requests about the photo only (v1 once said "darken the points with a pen")
    and only for answers that can't be checked.
  - ADR 0014 accepted.
- 2026-11-11: emails for low scores only (founder) — `gradeNeedsParent` is now "graded below the
  alert score"; retake requests show to her in the app and to the parent in the digest
  ("retake asked" / "Retake photos"). Not released yet: the push to `main` is the founder's.

## References

- llmgw: `../llm-gateway/CLAUDE.md` (models, `tool_choice` per provider, `/v1/limits`).
- homenews `apps/api/src/services/llm-client.ts` (client pattern, models in settings).
