# 0017 — The child sees hints per question, never the score or the answers

- **Status:** accepted
- **Date:** 2026-11-11
- **Deciders:** founder

## Context

[ADR 0014](./0014-homework-graded-by-an-llm.md) kept every grade from the child except a retake
request. A week in, the founder wants the child to learn from it too: right after Submit, a short
hint for each question that needs another look — while the parent keeps the full comments with the
answers. The parent's item page also needed a clearer shape: the grade comments, then what the
child sees, each per question.

More children may be added later, so nothing may assume a pronoun.

## Decision

- **The model writes for both readers** (grading prompt v4, `GRADING_HINTS_FROM = 4`): one entry
  per question that is not fully right, in the order it appears on the work — the label as printed,
  the photo, a result (`wrong | partly | blank | unreadable`), the problem and the fix with the
  answer (parent), and a **hint** of at most 20 words for the child: what to recheck, the idea to
  use, or a guiding question; never the answer, a corrected value or a step that gives it away. Plus
  the labels of the questions that are right, and one encouraging **note** to the child (no score).
- **The child's name goes to the model** ("Student: Ivy"); the prompt, the emails and the screens
  use the name, never she / he (the prompt says to use the name, or "they" if it must).
- **The child sees** (`ChildFeedback`, built by one shared function, `childFeedbackFromGrade`):
  the note, one row per question (label · photo link · hint), the retake request while the item is
  not past due, and "Checking your photos…" while a Submit waits. Never the score, the summary, the
  problems, the fixes or the results — the API never sends them (the integration test greps the
  raw JSON for the keys). Submitted items with feedback to act on sit on top of the child's list
  ("Feedback to look at"), with "Retake photo" / "N hints" chips.
- **The parent's item page**, in parts set off from each other: the score and Grade again; the
  retake request; *For you* (summary, one row per question — label, photo link, result, problem,
  fix — and a "Correct:" line); *What <child> sees* (the same rows the child gets, from the same
  function); *Links* (the teacher's gradebook, M14); *Earlier grades*. The alert email follows the
  same per-question layout.
- Grades from before v4 show "Grade again to add hints"; all of them were re-graded quietly on
  release (`scripts/regrade.ts`).

## Consequences

- The child gets something to act on the same evening, without being handed the answers. The
  parent can read exactly what the child was told.
- The hint is only as safe as the model: the prompt forbids answers, and the parent's preview makes
  a leak visible. Phase 0 check on the real Oct 26 packet: six hints, none with an answer.
- The child now sees model output beyond the retake request — keep the hint rules in the prompt
  when it changes, and look at a few real hints after each prompt version.

## Notes

- Supersedes the "grade is parent-only; the retake request is not" part of ADR 0014 decision 3 —
  the score, problems and fixes stay parent-only.
- Milestone: [15 — Hints for the child](../milestones/15-hints-for-the-child.md).
