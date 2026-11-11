# 0014 — Homework graded by an LLM through llmgw

- **Status:** accepted
- **Date:** 2026-11-10
- **Deciders:** founder

## Context

Since M10–M11 the child enters her homework, photographs her work and presses Submit. A month in
(Oct 4 – Nov 2) there are 23 submitted items with 58 photos of her work (7 photos of homework
sheets), and the parent has to open each one to see whether it is right. The notes alone carry
signal ("IDK how to do the last page"), and a spot check of one math page found a real conceptual
error (a reflection over y = x done as a sign flip) that nobody saw from the list.

The home cluster already runs **llmgw**, the self-hosted OpenAI-compatible gateway
(`http://llmgw.llmgw.svc.cluster.local`, used by homenews and homejobboard). It routes to Claude
through the family's Claude subscription, to GPT through the ChatGPT login, and to local Ollama
models, and `/v1/models` says which models read images (`input: ["text","image"]`).

Stage 4 of the child-homework plan (ADR 0006) pencilled in a parent approve / send-back step. The
founder wants the review done *for* them: a grade on each submission, an email only when the grade
says the parent is needed, and a retake request when the photos cannot show the work.

## Decision

Every Submit is graded by a vision model through llmgw, in the API, after the fact:

1. **A grade per submission.** One `homework_grades` row per graded `submitted_at`: `graded`
   (score 0–100 for what could be checked, a summary, findings with photo + question numbers, a
   "stuck" flag), `retake` (almost nothing can be checked: too blurry, dark or too little shown),
   `not_gradable` (nothing to look at: work done on a computer, no photos) or `failed`. **A retake
   request can come with any status** — a graded submission whose answers on one photo can't be
   read still gets its score, plus a request for that photo (Phase 0: grading-or-retake was too
   blunt; a cut-off top on one page hid a real misconception on another).
2. **Email only for a low score.** An alert email goes to the parent right after grading when the
   score is below the alert threshold (a setting, default 80). A retake request sends no email
   (amended 2026-11-11, see Notes): the child sees it in the app, the parent in the daily digest.
   Every grade appears in the existing daily digest email, in a new section. Same SMTP sender.
3. **The grade is parent-only; the retake request is not.** The child never sees a score, a
   summary or a finding. A retake request (which photos, and why — about the photo only) shows on
   her item until she submits again, so she can fix it that evening; the parent's email says the
   same. Anything more for the child is stage 4's approve / send back, decided later.
4. **Model by setting.** The model and a fallback model are parent settings (Settings → Grading),
   picked from the image-reading models llmgw lists. Defaults: `claude-sonnet-5-5`, falling back to
   `gpt-6-luna` (another subscription, so one plan's usage window can't stop grading).
5. **Cloud is fine.** Photos go to Anthropic / OpenAI through the family's own subscriptions;
   the local `qwen3-vl:8b` stays selectable but is weak at checking math.
6. **As soon as possible, through a sweep — not inline.** Submit stays instant. The database is
   the queue: a sweep every minute grades submissions that are at least a minute old and have no
   grade, one at a time; failed ones retry after 5 min, 30 min and 2 h. A retake or a low grade is
   only useful that evening, while she has the paper and the parent can help; and a sweep over
   the database survives API restarts with no new infrastructure.
7. **Teacher grades come later.** Linking an item to the teacher's TeacherEase assignment has no
   shared key (names differ, dates drift, 1 : n both ways, and teacher grades post days or weeks
   later), so it is its own milestone (14) and ADR. This ADR only records `sheet_title` (the
   title printed on the sheet) on each grade for it.

Considered and not chosen: grading inside the Submit request (slow, fails the child's Submit when
llmgw is down); "sorting" without a score (the founder asked for a grade); the school's 1–3
M / P / B scale (too coarse for a threshold — can be shown alongside later); a separate report
email (the founder wants the existing daily digest).

## Consequences

- The parent opens only the items an email points at; everything else is one line in the digest.
- Grades can be wrong (handwriting, graphs, a page the model misreads). They are flags for the
  parent, never shown to the child (a wrong retake request costs her one more photo), and
  "Grade again" re-runs one. Each row keeps the model and the prompt version, so a prompt change
  is traceable.
- A new runtime dependency: llmgw. When it or both models are down, items stay waiting and are
  retried (3 tries per submission); the digest lists "couldn't grade" so nothing goes missing
  silently.
- The child's photos leave the house (to the model providers), accepted by the founder.
- Items done on a computer get no grade — the digest says "not checked" rather than guessing.

## Notes

- Phase 0 (2026-11-10, the 23 real items, prompt v1): Sonnet 5.5 and Opus 5.5 within a few points
  of each other, both catch the y = x reflection error; Sonnet ~30% faster (~17 s avg, 40–60 s for
  a 9-photo packet) → the default. `qwen3-vl:8b` failed 6 of 23 (timeouts, unreadable answers) and
  took 2–5 min each. Prompt v2: a retake request is about the photo only — v1 once told her to
  "darken the points with a pen".
- 2026-11-11 (founder): emails for low scores only. On last month's data about 1 in 3 submissions
  carried a retake request (math packets photographed with the top of the page cut off), which
  would have meant an email for most math homework; the retake request already reaches the child in
  the app and the parent in the digest. A low score that comes with a retake request still mentions
  it in its email.
- Built with plain `fetch` + Zod (`lib/llm.ts`), not the OpenAI SDK homenews uses: two calls,
  tool calling and images, no new dependency.
- Milestones: [13 — Homework grading](../milestones/13-homework-grading.md),
  [14 — Teacher grade matching](../milestones/14-teacher-grade-matching.md).
- Related: [ADR 0006](./0006-child-entered-homework.md) (stage plan),
  [ADR 0008](./0008-solutions-on-the-item-and-a-change-history.md) (solution photos),
  [ADR 0011](./0011-submit-marks-homework-done.md) (Submit), [ADR 0003](./0003-one-json-line-per-event.md) (logs).
