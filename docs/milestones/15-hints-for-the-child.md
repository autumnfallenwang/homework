---
name: 15-hints-for-the-child
status: in-progress
created: 2026-11-11
---

# Milestone 15 — Hints for the child, a clearer grade page

Right after Submit, the child sees a short hint for each question that needs another look — never
the score or the answers — and the parent's item page shows the grade in clearly separated parts,
one row per question ([ADR 0017](../adr/0017-hints-for-the-child.md)).

## Scope / deliverables

- Grading prompt v4: the student's name, no assumed pronouns; per question (in order): label,
  photo, result, problem, fix, hint; the correct questions; a note to the child. Migration
  `0010_grade_hints` (`child_note`, `correct_questions`).
- Shared `ChildFeedback` + `childFeedbackFromGrade` (the one source of what the child sees),
  `childPhotoLabel`, `FINDING_RESULT_LABELS`, `GRADING_HINTS_FROM`.
- API: child routes return `feedback` (note, hints, retake, checking); parent grade list carries
  `childName`; alert email per question (`Q1c · Solution photo 1 · Wrong`, then problem, fix);
  neutral wording in emails and the matcher prompt (MATCH_PROMPT_VERSION 3).
- Web: the parent's Grade card in parts (For you · What <child> sees · Links · Earlier grades),
  per-question rows (`feedback-rows.tsx`); the child's "Feedback on your work" card, a "Feedback to
  look at" group on top of the child's list, "Retake photo" / "N hints" chips; neutral Settings text.
- `scripts/regrade.ts` re-grades every older-prompt grade (any status), quietly.

## Exit criteria

- [x] lint, typecheck, unit tests (reader: results, hints, note, correct list; prompt names the
  student and has no she / he; child feedback keeps only note / hints / retake; email layout) and
  integration tests (the child's raw JSON never has score / summary / problem / fix / result; hints
  stay after the due day, the retake request doesn't; the parent's list carries the child's name;
  re-grade of every older-prompt grade).
- [x] Dev end to end on the real Oct 26 packet (Sonnet 5.5, prompt v4): 76/100, six per-question
  rows with results and fixes for the parent, six hints for the child — none with an answer
  ("Look at the point at x = −6. Is it above or below the x-axis?"), 31 questions listed correct;
  screenshots of the parent's parts, the child's list ("Feedback to look at": Retake photo · 6
  hints) and the child's card.
- [ ] Released: every item re-graded with prompt v4; the child's pages show hints.

## Decisions

- **Founder, 2026-11-11:** the child's name goes to the model; never assume she / her (more
  children may come); keep the score from the child; hints right after Submit; re-grade all after
  release; one row per question in both parts.

## Progress

- 2026-11-11: built and checked locally (see exit criteria).
