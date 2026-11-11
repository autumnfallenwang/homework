# Architecture

homework migrates the **TeacherEase Parent Companion** — originally a desktop app (a Next.js UI wrapped in a Tauri/Rust shell) that scraped a child's TeacherEase portal, stored grades and homework locally in SQLite, ran a fetch scheduler, and emailed daily digests — into a self-hosted full-stack web application running on the home k3s cluster. The goal of this phase is a 1:1 functional port onto the deployed stack; multi-user accounts and other enhancements are deferred to future work.

## System shape

The system follows the established house pattern of the sibling projects `homenews` and `homecal`: a Turborepo + pnpm monorepo split into a **Hono + Zod** backend API and a **Next.js App Router** web frontend, backed by **PostgreSQL via Drizzle**, with shared Zod schemas in a `packages/shared` workspace. The web frontend talks to the API over HTTP. The scraping, scheduling, and email-digest responsibilities that previously lived in the Tauri/Rust desktop shell are relocated server-side into the API. Deployment is GitOps-driven through `arch-infra`: GitHub Actions builds and pushes images to GHCR, bumps the image tags in the `arch-infra` repo, and Argo CD reconciles the k3s cluster from the Helm chart under `deploy/chart/`.

## Key components

- **`apps/api` (Hono + Zod)** — the TeacherEase scraper (cheerio), the fetch scheduler, the SMTP digest sender, and Drizzle data access.
- **`apps/web` (Next.js App Router)** — the Today / Classes / History / Settings views ported from the desktop app, plus the parent's Review tab, a separate child area (`/child`), `/sign-in` and `/join/<token>`.
- **Logins ([ADR 0004](adr/0004-accounts-and-roles.md))** — Better Auth in the API (Drizzle tables `users`/`sessions`/`accounts`/`verifications`, plus `invites`), two roles: **parent** (the whole app, manages child profiles and their data sources) and **child** (their own area only). A *child login* (`users.child_id`) points at a *child profile* (`children`); child logins are created from one-time invite links, never by open sign-up. The API enforces every rule by path: `/api/public/*` open, `/api/child/*` child-only, everything else parent-only. The session cookie is shared across the web and API hosts via `COOKIE_DOMAIN=.arch.internal`.
- **Child-entered homework ([ADR 0006](adr/0006-child-entered-homework.md), [0007](adr/0007-given-on-date-replaces-day-marks.md), [0008](adr/0008-solutions-on-the-item-and-a-change-history.md), [0011](adr/0011-submit-marks-homework-done.md), [0012](adr/0012-parent-deletes-homework.md))** — each child profile has one homework source: the scraped class homework page (`page`) or the child's own entries (`child`). Entries live in `homework_items` (class from a parent-owned `child_classes` list, or Other; a given-on day the child picks, on or before the due day and never after today — a CHECK backs the first), with photos as bytea in `homework_photos` (shrunk in the browser, kind `sheet` or `solution`). The child's solution (a required note, optional solution photos) sits on the same item; Save keeps it as a draft and Submit marks the item done (`submitted_at`, [ADR 0011](adr/0011-submit-marks-homework-done.md)). Until the next 7 AM after an item was added the child may change or delete anything unrecorded; after that Given on is locked, the item stays, photos are only hidden (`removed_at`) and every change goes into `homework_item_events`. The child writes under `/api/child/homework*`; the parent reads — Review (with the history), Today and the digest, where "Homework for today" goes by the given-on day — and can delete any item for good from its page ([ADR 0012](adr/0012-parent-deletes-homework.md)).
- **Homework grading ([ADR 0014](adr/0014-homework-graded-by-an-llm.md), M13)** — every Submit is graded by a vision model through **llmgw**, the cluster's OpenAI-compatible gateway (`LLM_GATEWAY_URL`, plain fetch in `lib/llm.ts`). The database is the queue: a node-cron sweep in the API (every minute) grades submissions a minute old with no row in `homework_grades` (score 0–100, findings, a "stuck" flag, an optional retake request, the sheet's printed title; `failed` rows retried 3×), one at a time, model then fallback model. A low score emails the parent at once (same SMTP sender); a retake request goes to the child in the app and to the parent in the daily digest, where every grade is listed once (`reported_at`). The parent sees grades on Review (chips, the item's Grade panel, Grade again); the child sees only the retake request and "checking" — never a score. Settings → Grading holds the switch, models, alert score and extra instructions (`grading.*` in `settings`). Grade text is Markdown with `$LaTeX$` math from prompt v3, rendered on the item page with KaTeX and sent as Unicode in emails ([ADR 0016](adr/0016-grade-text-markdown-katex.md)).
- **Teacher-grade matching ([ADR 0015](adr/0015-teacher-grade-matching.md), M14)** — after each TeacherEase fetch, her submitted items are linked to the teacher's assignments (`homework_item_assignments`, by TeacherEase's `te_assignment_id`): candidates by class name and a ±10-day due window in code, the pick by a small text model through llmgw (only when the candidate set changed, `homework_match_attempts`); confident → linked, unsure → suggested for the parent to confirm. The teacher's score (latest fetch) shows beside the model's, and new teacher scores go into the digest with a disagreement flag.
- **`packages/shared`** — shared Zod schemas and TypeScript types used by both API and web.
- **PostgreSQL (Drizzle)** — per-child grades, scraped and child-entered homework (with photos), logins and settings; replaces the desktop app's local SQLite. No backup job yet (ADR 0006).
- **`deploy/chart` (Helm)** — managed by `arch-infra` + Argo CD, which own the k3s lifecycle.
- **Loki / Grafana / Alloy** — centralized logs, consistent with the sibling apps. Every line is
  one JSON object on stdout in the house shape (`level` as a word, `time`/`service`/`version`/
  `event`/static `msg` + fields): the API via **pino** (`req_id` on every line of a request,
  `job`/`run_id` on every line of a scheduled run, crashes as one `fatal` line), the web via Next's
  `onRequestError` (`web.request_error`). An Alloy DaemonSet tails stdout and labels by
  namespace/pod/container; Loki parses JSON at query time and keeps `homework` for 30 days. See
  [ADR 0002](adr/0002-structured-logging-pino-loki.md) and
  [ADR 0003](adr/0003-one-json-line-per-event.md).

## Constraints and non-goals

- **LAN-only.** Served behind `*.arch.internal` ingress on the home k3s cluster; no public-internet exposure (matching `homenews` / `homecal`).
- **The port (M01–M07) was 1:1; features since are staged** — logging (M08), then the child-homework stages: accounts and roles (M09), child homework entry (M10). One household; no multi-tenant accounts.
- **Model calls only through llmgw.** No provider keys in this app; llmgw (cluster-internal, no ingress) routes to Claude / GPT on the family's subscriptions or to local Ollama. Photos of the child's work leave the house to those providers — accepted in ADR 0014.
- **Plain HTTP on the LAN.** Session cookies and invite links travel unencrypted on the home network, as in the sibling apps; exposure beyond the LAN would require HTTPS first (ADR 0004).
- **The desktop / Tauri build is retired** in favor of the web app.

## Open questions

- *(None open.)*

Answered: the fetch scheduler runs inside the API process as a node-cron singleton (M05; the api Deployment is `Recreate`, one replica). Encryption at rest for the TeacherEase and SMTP passwords: sealed in the API with AES-256-GCM, key derived from `BETTER_AUTH_SECRET` (M12, [ADR 0010](adr/0010-credentials-encrypted-at-rest.md)).
