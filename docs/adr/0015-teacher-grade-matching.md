# 0015 — Her items matched to the teacher's grades by a small model

- **Status:** accepted
- **Date:** 2026-11-10
- **Deciders:** founder

## Context

M13 grades each submission with a model ([ADR 0014](./0014-homework-graded-by-an-llm.md)). The
founder wants the teacher's real grade beside it, from TeacherEase, which the app already scrapes
three times a day — but there is **no shared key** between what the child enters and the teacher's
gradebook. On the real data (23 items, the latest fetch's 97 assignments):

- Classes match by name: her parent-owned class list uses TeacherEase's names (8 of 9).
- Assignments don't: she writes "packet", "Google doc"; the teacher "#026 Discussion Reflection",
  "Stamp Act Documents". Dates drift (Stamp Act: hers 10/15, the teacher's 10/20; Lingco: the
  teacher's 10/7 inside her "edpuzzle and lingco" due 10/14). Links go 1 : n both ways, and many
  items have no counterpart (math packets — the teacher grades quizzes and tests).
- Teacher grades post 0–19 days after the due day, so a link can't be made at grading time.
- TeacherEase's own `te_assignment_id` is set on every assignment and stable across fetches.

## Decision

- **Candidates in code**: same class by name (case-insensitive), the teacher's due date within
  **10 days** of hers either way (TeacherEase's "M/D" put in the nearest year).
- **The pick by a small text model** through llmgw (`grading.matchModel`, default
  `claude-haiku-5-5`): her title, details, note, dates, and from her latest grade the title printed
  on the sheet and what the photos showed; the candidates by id. It returns 0..n links, each
  `high | medium | low`: same work only (practice is not the test), a contradicting note caps it at
  medium.
- **Trust**: high → linked; medium → suggested ("Probably …", Confirm / Not this); low → dropped.
  The parent can also pick any candidate. **The parent's word is final** (a confirmation, a
  rejection or their own pick); the model's own links are replaced by its next run.
- **When**: after each successful TeacherEase fetch, only for submitted items due in the last 30
  days whose candidate set (hashed with the prompt version) changed since their last try — 0–3
  small calls a day. Only while grading is on.
- **Stored** as `homework_item_assignments` keyed by `te_assignment_id` (+ a snapshot of the
  names); the teacher's score is always read from the latest fetch. The digest lists a teacher score
  when it is new or changed (`teacher_reported_score`), with the model's score beside it and a flag
  when they disagree (model ≥ the alert score but teacher P / B / Missing, or the reverse).
- The release backfill matches quietly: today's teacher scores count as already reported.

Considered: string similarity on names (the names don't share words — "Google doc" vs "Stamp Act
Documents"); matching at grading time (most teacher grades aren't posted yet); Sonnet as the
matcher (more conservative: 3 of the 5 clear links as high vs Haiku's 5, no fewer wrong ones).

## Consequences

- About a third to two fifths of her items get a teacher grade, typically a week after the due
  day; the rest never will (no counterpart), and the UI says "not linked" rather than guessing.
- The disagreement flag is the way to check the model's grades over time.
- Teacher grades are mostly 3=M (~90%), so the check is weak at the top and useful at the bottom
  (P, Missing, Late).

## Notes

- Milestone: [14 — Teacher grade matching](../milestones/14-teacher-grade-matching.md).
- Phase 0 dry run (Haiku, prompt v2): the 5 clear links all `high` (Stay & Stray Theme Reflection,
  Advice from Adult HW, Discussion Reflection, Edpuzzle - arrondissements + Lingco - monuments), no
  wrong `high`, 6 suggestions (one doubtful: a math packet → the unit test).
