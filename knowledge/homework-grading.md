---
name: homework-grading
description: M13–M14 / ADR 0014–0015 — each Submit graded by a vision model via llmgw (sweep every minute, DB is the queue), email only for a low score (retakes → app + digest), the child sees only the retake request; teacher-grade matching after each fetch; where each rule lives + pitfalls (turbo drops DATABASE_URL, prompt versions, real-data dry runs).
metadata:
  type: feedback
---

**Grading (M13, ADR 0014).** `services/grader.ts` = one grade without the DB (prompt in
`grading-prompt.ts`, bump `GRADING_PROMPT_VERSION` with every prompt change — it's stored per
row); `services/grading.ts` = settings (`grading.*` KV), the sweep, storing, alerts, what each side
sees, digest lines, backfill. `lib/llm.ts` = plain fetch to `LLM_GATEWAY_URL` (default
`http://llmgw.llmgw.svc.cluster.local`, which also resolves on arch).
- A grade row is per `submitted_at`; "current" = the item's submitted_at, compared with
  `date_trunc('milliseconds', …)` on both sides. Newest non-`failed` row wins; `failed` rows count
  the tries (3, backoff 5 min / 30 min / 2 h, `nextGradeAttemptAt`).
- Sweep: node-cron `* * * * *` armed always, checks `grading.enabled` itself; picks `homework_source
  = child` items submitted ≥ 60 s ago and after `grading.enabledAt`; one at a time (module mutex).
  Grade again = in-memory queue emptied first by the next sweep (lost on restart — fine).
- A retake request can come WITH a score (`retakeReason` on a `graded` row). Alert email = score <
  `alertBelow` ONLY (founder, 2026-11-11 — a retake request alone goes to the child in the app and
  the parent in the digest); never for the parent's Grade again or the backfill (both set
  `reported_at` at insert so the digest skips them too).
- The child gets `feedback` only (`childFeedback` → shared `childFeedbackFromGrade`, the same
  function the parent's "What <child> sees" uses): note, hints per question, the retake request
  while `dueOn >= today`, or `checking`. Never score, summary, problem, fix or result — the
  integration test greps the raw JSON for those keys (ADR 0017, prompt v4).
- No assumed pronouns for children anywhere (prompts, emails, screens): use the child's name
  (`children.display_name`, sent to the model as "Student: <name>") — more children may come.
- Grade text (prompt v3+, ADR 0016) is Markdown + `$LaTeX$`: `MathText` (web, KaTeX) renders it only
  when `promptVersion >= GRADING_RICH_TEXT_FROM`; emails/digest go through `mathToText` (shared).
  The reader repairs JSON-mangled LaTeX (`\f`rac → `\frac`) and turns tags ("solution-2") into words.
  `scripts/regrade.ts` re-grades older-prompt grades quietly.
- llmgw: Sonnet 5.5 always thinks, so llmgw can't force `tool_choice` and asks in words instead;
  the reader accepts the tool call or a JSON object in the text, retries once, then the fallback.

**Teacher matching (M14, ADR 0015).** `services/teacher-match.ts`: candidates in code (class by
name, teacher's "M/D" within ±10 days, `teDueToIso` picks the year), pick by `grading.matchModel`
(Haiku), asked again only when the candidate-set hash (incl. `MATCH_PROMPT_VERSION`) changes. The
parent's word is final (`source = parent` or `rejected`); the model's own links are replaced by its
next run. Runs from `runFetchCycle` after each child's fetch, only while grading is on.

**Pitfalls:**
- `pnpm test` (turbo) does NOT pass a `DATABASE_URL` override through — integration tests then hit
  `.env`'s DB. Run `pnpm exec vitest run` in `apps/api` with `DATABASE_URL=…/homework_test`.
- Phase 0-style dry runs on real data: copy rows out with `kubectl exec … psql -c "\copy (…) to
  stdout"` into a separate local Postgres (never materialize the cluster DB password — refused),
  then `scripts/grade-dry-run.ts` / `match-dry-run.ts` (read-only connections).
- Retake prompts drift toward "fix your work" ("darken the points") — keep the reason about the photo.

Related: [[child-homework-entry]], [[scheduler-nodecron-slots]], [[smtp-tls-port-rule]],
[[logging-pino-loki]].
