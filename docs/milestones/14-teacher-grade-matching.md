---
name: 14-teacher-grade-matching
status: in-progress
created: 2026-11-10
---

# Milestone 14 — Match her items to the teacher's grades

When the teacher posts a grade in TeacherEase for something Ivy entered, the parent sees it next
to the model's grade ("Teacher: #033 Stay & Stray Theme Reflection — 3=M · ours 88"), and the
digest says when a teacher grade arrives. Built after M13 has run for a while. The ADR (0015) is
[ADR 0015](../adr/0015-teacher-grade-matching.md).

## Can they be matched? (real data, 2026-11-10)

There is **no shared key** between her items and TeacherEase assignments — only names and dates:

- **Classes: yes, by name.** Her class list (parent-owned) uses TeacherEase's exact names
  ("Mathematics 8 Honors", "English 8", …): 8 of 9 match case-insensitively; the 9th ("Math") is a
  stray entry.
- **Assignments: sometimes, by meaning — not by name.** She writes "packet", "Google doc",
  "discussion question"; the teacher's names are "#026 Discussion Reflection", "Stamp Act
  Documents". Due dates differ by 0–5 days. And the link isn't 1 : 1:
  - one item → two assignments: "edpuzzle and lingco" (note: monuments) → *Edpuzzle -
    arrondissements* + *Lingco - monuments*;
  - two items → one assignment: "discussion question" + "discussion questions" → *#026 Discussion
    Reflection*;
  - no assignment at all: the 6 math packets (the teacher grades quizzes and tests, not packets),
    the Science study guide (graded as the test).
- My manual pass over the 23 items: **~5 clear** (Stay & Stray Theme Reflection, Advice from Adult
  HW, Discussion Reflection ×2, Edpuzzle + Lingco), **~4 plausible** (Annotation - Colonial Trade
  Systems, Stamp Act Documents, Blooket – which one, Claim Statement Sheet), **~14 none**. So about
  a third to two fifths of items get a teacher grade.
- **Teacher grades arrive late.** An assignment first appears in TeacherEase 0–19 days after its
  due date (about a week typically) — so matching can't happen at grading time; it has to run as
  new assignments show up.
- **The link can be stored durably:** every assignment has TeacherEase's own id
  (`te_assignment_id`, 97 of 97 set, unique), stable across fetches; the score is read from the
  latest fetch (it changes: Missing → 3=M after a late turn-in).
- **Teacher grades are mostly 3=M** (~90%): a weak check of the model's scores, but P, Missing and
  Late are worth seeing.

## Approach

- **Candidates (code):** same class by name; TeacherEase due date within 10 days of hers either way
  (was −3 … +7: missed Lingco, due a week before her bundled "edpuzzle and lingco").
  No class match or no candidates → no model call.
- **Pick (model, text only):** a small model (`claude-haiku-5-5`, setting `grading.matchModel`)
  gets her title, details, note, dates, M13's `sheet_title` + summary (what was printed on the
  sheet — often the teacher's own assignment name), and the candidates. A `record_matches` tool
  returns 0..n `{ te_assignment_id, confidence: high | medium | low, reason }`.
- **Trust:** high → linked; medium → shown to the parent as "Probably …" with Confirm / Not this;
  low → dropped. The parent can also pick another candidate or unlink. The parent's word is final;
  the model's own links are replaced by its next run (a later run knows more assignments).
- **When:** after each successful TeacherEase fetch (07:00 / 15:00 / 23:00 weekdays), for her items
  submitted in the last 30 days with no confirmed link, only when the candidate set changed since
  the last try (hash stored) — 0–3 small calls a day. The 15:00 fetch runs before the 15:15 digest,
  so a new teacher grade reaches the same day's email.

## Scope / deliverables

### Phase 0 — Dry run on the real 23 items

- `scripts/match-dry-run.ts` (read only) runs candidates + the matcher and prints the result next
  to the manual pass above. Go on only if the 5 clear items come out `high` and no wrong match comes
  out `high`.

### Phase 1 — Data and matcher

- `homework_item_assignments`: `item_id` (FK, cascade), `te_assignment_id`, `class_name`,
  `assignment_name` (snapshot), `confidence`, `reason`, `source` (`model | parent`), `state`
  (`suggested | confirmed | rejected`), `teacher_reported_score` (last score the digest
  mentioned), `created_at`; unique `(item_id, te_assignment_id)`. Match attempts: `item_id`,
  `candidates_hash`, `at`.
- `services/teacher-match.ts` + the post-fetch hook in `runFetch`'s cycle; `grading.matchModel`
  setting (Settings → Grading); logs `match.done` / `match.failed`.

### Phase 2 — Screens and digest

- Parent item page: "Teacher" line under the Grade panel (score from the latest fetch, Missing /
  Late shown as such); "Probably …" with Confirm / Not this; "Pick another" (candidate list).
- Parent Review list: a small teacher chip (`T: M`, `T: P`, `T: Missing`).
- Digest: "Teacher graded" lines when a linked assignment gets a score or its score changes
  (`teacher_reported_score`), with the model's score beside it; flagged when they disagree
  (model ≥ the alert threshold but teacher P / B / Missing, or the reverse) — that feeds prompt and
  threshold tuning.
- The child sees none of this.

## Exit criteria

- [x] Phase 0 dry run meets the bar: Haiku 5.5 with prompt v2 links all 5 clear items `high`
  (Stay & Stray, Advice from Adult HW, Discussion Reflection, Edpuzzle + Lingco) and no wrong one
  `high`. (v1 with the −3/+7 window: 3 of 5, and one doubtful `high` — Blooket - futur for a
  Blooket her note says was about Paris monuments; now `medium`.)
- [x] lint, typecheck, unit tests (candidate window, class-name match, hash, answer reading, M/D
  dates, bands, disagreement) and integration tests (asked again only on a changed candidate set,
  high/medium/low, the model's stale links replaced, parent confirm / reject / pick final, chips,
  digest lines once + again on a changed score, quiet backfill, the post-fetch hook only while
  grading is on).
- [x] Dev end to end on the real-data copy: the backfill linked 5 / suggested 6; Review shows
  `T: M` / `T: P?` chips; the item's "Probably: Stamp Act Documents 2=P" → Confirm; a changed
  teacher score lands in the digest as "teacher lower than ours".
- [ ] Released: the next teacher grade for a linked item shows on the item page and in the digest.
## Open questions

1. Map M / P / B onto 0–100 for the disagreement flag as M ≥ 80, P 60–79, B < 60? [yes, for the
   flag only — never shown as a converted score]

## Progress

- 2026-11-10: planned from the real data (23 items, the latest fetch's 97 assignments).
- 2026-11-10: built with M13 (ADR 0015). Haiku stays the matcher: Sonnet was more conservative
  (3 of 5 clear links `high`) with no fewer wrong ones.
