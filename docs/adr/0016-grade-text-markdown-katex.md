# 0016 — Grade text as Markdown + LaTeX, rendered with KaTeX

- **Status:** accepted
- **Date:** 2026-11-11
- **Deciders:** founder

## Context

The model's grades ([ADR 0014](./0014-homework-graded-by-an-llm.md)) are mostly about math:
fractions (`15/4 − 5/6 = 35/12`), inequalities (`−2x < −98 → x > 49`), exponents, absolute
values, coordinate pairs, sets. As plain text they read poorly, and the founder asked for them to
look like a rendered Markdown preview.

## Decision

- **The model writes Markdown with LaTeX math** in the parent's fields (summary, each finding's
  question, problem and fix): inline `$…$` only, `**bold**` / `*italics*`, nothing else (no
  headings, lists, tables, links, `$$`). The child's retake request and the sheet title stay plain
  text. Grading prompt v3 (`GRADING_RICH_TEXT_FROM = 3`).
- **The parent's item page renders it** with `react-markdown` + `remark-math` + `rehype-katex`
  (KaTeX 0.16): stacked fractions, real exponents, ≤ ⇒ ∈. Model output is untrusted: raw HTML
  skipped, links / images / headings / lists / tables / code blocks unwrapped to their text, KaTeX
  with `trust: false` and `throwOnError: false` (a bad formula shows its source).
- **Emails get readable Unicode** (`mathToText` in shared: `\frac{35}{12}` → 35/12, `x^2` → x²,
  `\le` → ≤, `\cdot` → ·): mail clients run no JavaScript and Gmail strips MathML; the email links
  to the page for the rendered version.
- **Older grades stay plain** (prompt version < 3): Markdown would turn a stray `*` into italics.
  `scripts/regrade.ts` grades older ones again, quietly, to give them the new text.
- Two guards in the reader: LaTeX escapes mangled by JSON (`\frac` unescaped → a form feed +
  "rac") are repaired inside `$…$`, and prompt photo tags ("solution-2") become words ("solution
  photo 2"; "homework photo 1" in her retake request, as her page says).

Considered: MathML (no Gmail, and the model is better at LaTeX); MathJax (heavier than KaTeX);
rendering formulas to images for email (Gmail blocks SVG, PNGs need a renderer in the API).

## Consequences

- Math reads like a textbook on the item page; emails stay readable without it.
- The item page's bundle grows by ~117 kB (KaTeX + Markdown), on that page only.
- A prompt change: grades now carry `promptVersion` to the web so it knows how to show each one.

## Notes

- Milestone: [13 — Homework grading](../milestones/13-homework-grading.md) (follow-up).
- Checked on the real Oct 26 packet (Sonnet 5.5, prompt v3): every formula in `$…$`, clean JSON,
  72/100 both times, the email converts to `-2·3³=-54`, `(x,y) → (y,x)`, `180÷3²·2`.
