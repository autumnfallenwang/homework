---
name: 00-overview
status: reference
created: 2026-05-30
---

# Migration overview — desktop → k3s

This is the roadmap index for porting **TeacherEase Parent Companion** (a Next.js + Tauri/Rust desktop app) to **homework** (a Turborepo full-stack web app on the home k3s cluster). Scope is a **1:1 functional port**; multi-user/auth and other extras are future work.

Each milestone below is a separate file with detailed scope, exit criteria, locked decisions, and open questions. Work them in order — each depends on the prior.

| # | Milestone | What ships | Depends on |
|---|-----------|-----------|------------|
| 01 | [Monorepo bootstrap](01-monorepo-bootstrap.md) | Turborepo skeleton, api/web/shared, dev loop, `/health` | — |
| 02 | [Data model & DB](02-data-model.md) | 9 tables → Drizzle/Postgres, migrations, seed | 01 |
| 03 | [Scraper & fetch](03-scraper-port.md) | cheerio scraper + `runFetch` server-side | 02 |
| 04 | [HTTP API surface](04-api-surface.md) | Hono routes (full IPC contract), shared schemas + attention engine | 02, 03 |
| 05 | [Scheduler & email](05-scheduler-email.md) | node-cron scheduler + nodemailer digests | 03, 04 |
| 06 | [Web frontend](06-web-frontend.md) | Port views, swap ipc→api, drop desktop-only features | 04, 05 |
| 07 | [Deploy & GitOps](07-deploy-gitops.md) | Dockerfiles, Helm, CI, arch-infra registration | 01–06 |

## Cross-cutting decisions (locked)

- **Stack:** Turborepo + pnpm · Hono + Zod · Next.js App Router · Postgres + Drizzle · Vitest + Biome (follows homenews/homecal exactly).
- **Credentials at rest:** plaintext in Postgres (1:1 with desktop; LAN-only single-user). App-level encryption deferred to a future milestone.
- **Feature cuts** (desktop-only, removed in M06): auto-updater, autostart + system tray, OS notifications.
- **i18n:** KEPT (fully-implemented pure module; cheaper to keep than remove) — see M06 if reconsidering.
- **No auth** — single-user, LAN-only.

## Standing open questions (need your input before the relevant milestone)

1. **Cluster timezone** (M05/M07) — what `TZ` for correct digest/slot times? *(blocking for M05)*
2. **Parser test fixtures** (M03) — provide a scrubbed real-portal HTML sample, or rely on the source repo's existing `tests/` fixtures?
3. **UI prefs storage** (M06) — `ui.selectedChildId` + appearance: server settings (1:1) or browser localStorage (recommended)?
4. **arch-infra registration** (M07) — open a PR on the arch-infra repo myself, or hand you `apps/homework.yaml` to commit?

## How to work a milestone

Run `/devkit-task` — it reads `CLAUDE.md`, `docs/architecture.md`, and the highest-numbered open milestone, then plans → gates → implements → verifies. Use `/devkit-commit` to ship. `devkit-update-milestone` appends progress notes and closes a milestone when its exit criteria are met.
