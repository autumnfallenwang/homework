# Architecture

homework migrates the **TeacherEase Parent Companion** — originally a desktop app (a Next.js UI wrapped in a Tauri/Rust shell) that scraped a child's TeacherEase portal, stored grades and homework locally in SQLite, ran a fetch scheduler, and emailed daily digests — into a self-hosted full-stack web application running on the home k3s cluster. The goal of this phase is a 1:1 functional port onto the deployed stack; multi-user accounts and other enhancements are deferred to future work.

## System shape

The system follows the established house pattern of the sibling projects `homenews` and `homecal`: a Turborepo + pnpm monorepo split into a **Hono + Zod** backend API and a **Next.js App Router** web frontend, backed by **PostgreSQL via Drizzle**, with shared Zod schemas in a `packages/shared` workspace. The web frontend talks to the API over HTTP. The scraping, scheduling, and email-digest responsibilities that previously lived in the Tauri/Rust desktop shell are relocated server-side into the API. Deployment is GitOps-driven through `arch-infra`: GitHub Actions builds and pushes images to GHCR, bumps the image tags in the `arch-infra` repo, and Argo CD reconciles the k3s cluster from the Helm chart under `deploy/chart/`.

## Key components

- **`apps/api` (Hono + Zod)** — the TeacherEase scraper (cheerio), the fetch scheduler, the SMTP digest sender, and Drizzle data access.
- **`apps/web` (Next.js App Router)** — the Today / Classes / History / Settings views ported from the desktop app.
- **`packages/shared`** — shared Zod schemas and TypeScript types used by both API and web.
- **PostgreSQL (Drizzle)** — per-child grades, homework, and settings; replaces the desktop app's local SQLite.
- **`deploy/chart` (Helm)** — managed by `arch-infra` + Argo CD, which own the k3s lifecycle.
- **Loki / Grafana / Alloy** — centralized logs, consistent with the sibling apps.

## Constraints and non-goals

- **LAN-only.** Served behind `*.arch.local` ingress on the home k3s cluster; no public-internet exposure (matching `homenews` / `homecal`).
- **Scope is a 1:1 functional port.** Multi-user accounts, authentication, and additional features are explicitly future work, not part of this migration.
- **The desktop / Tauri build is retired** in favor of the web app.

## Open questions

- How are TeacherEase portal credentials and SMTP secrets stored in-cluster? Likely Sealed Secrets via `arch-infra` (as `homecal` does), since the desktop app's OS-keychain storage no longer applies.
- Schema design for credentials and config at rest now that there is no per-machine keychain — single shared config vs. per-child rows.
- Does the fetch scheduler run inside the API process or as a separate worker / k8s CronJob?
