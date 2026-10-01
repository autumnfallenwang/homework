# Architecture

homework migrates the **TeacherEase Parent Companion** — originally a desktop app (a Next.js UI wrapped in a Tauri/Rust shell) that scraped a child's TeacherEase portal, stored grades and homework locally in SQLite, ran a fetch scheduler, and emailed daily digests — into a self-hosted full-stack web application running on the home k3s cluster. The goal of this phase is a 1:1 functional port onto the deployed stack; multi-user accounts and other enhancements are deferred to future work.

## System shape

The system follows the established house pattern of the sibling projects `homenews` and `homecal`: a Turborepo + pnpm monorepo split into a **Hono + Zod** backend API and a **Next.js App Router** web frontend, backed by **PostgreSQL via Drizzle**, with shared Zod schemas in a `packages/shared` workspace. The web frontend talks to the API over HTTP. The scraping, scheduling, and email-digest responsibilities that previously lived in the Tauri/Rust desktop shell are relocated server-side into the API. Deployment is GitOps-driven through `arch-infra`: GitHub Actions builds and pushes images to GHCR, bumps the image tags in the `arch-infra` repo, and Argo CD reconciles the k3s cluster from the Helm chart under `deploy/chart/`.

## Key components

- **`apps/api` (Hono + Zod)** — the TeacherEase scraper (cheerio), the fetch scheduler, the SMTP digest sender, and Drizzle data access.
- **`apps/web` (Next.js App Router)** — the Today / Classes / History / Settings views ported from the desktop app, plus the parent's Review tab, a separate child area (`/child`), `/sign-in` and `/join/<token>`.
- **Logins ([ADR 0004](adr/0004-accounts-and-roles.md))** — Better Auth in the API (Drizzle tables `users`/`sessions`/`accounts`/`verifications`, plus `invites`), two roles: **parent** (the whole app, manages child profiles and their data sources) and **child** (their own area only). A *child login* (`users.child_id`) points at a *child profile* (`children`); child logins are created from one-time invite links, never by open sign-up. The API enforces every rule by path: `/api/public/*` open, `/api/child/*` child-only, everything else parent-only. The session cookie is shared across the web and API hosts via `COOKIE_DOMAIN=.arch.internal`.
- **Child-entered homework ([ADR 0006](adr/0006-child-entered-homework.md))** — each child profile has one homework source: the scraped class homework page (`page`) or the child's own entries (`child`). Entries live in `homework_items` (class from a parent-owned `child_classes` list, or Other), with photos as bytea in `homework_photos` (shrunk in the browser) and "that's everything for today" in `homework_days`. The child writes under `/api/child/homework*`; the parent reads them read-only on Review and Today and in the digest.
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
- **Plain HTTP on the LAN.** Session cookies and invite links travel unencrypted on the home network, as in the sibling apps; exposure beyond the LAN would require HTTPS first (ADR 0004).
- **The desktop / Tauri build is retired** in favor of the web app.

## Open questions

- **Encryption at rest** for TeacherEase portal and SMTP passwords. Today they are plaintext in Postgres (M02: per-child rows for portal logins, the global `settings` table for SMTP), behind the parent login since M09. The only cluster Secret is `homework-secrets` (`DATABASE_URL`, `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`); Sealed Secrets are not wired.

Answered: the fetch scheduler runs inside the API process as a node-cron singleton (M05; the api Deployment is `Recreate`, one replica).
