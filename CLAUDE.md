# homework

Migration of the TeacherEase Parent Companion desktop app to a self-hosted, k3s-deployed full-stack web app (with room to grow).

## Stack

- **Primary language:** typescript
- **Package manager:** pnpm

## Commands

Day-to-day work runs through the `claude-devkit` skills at `.claude/skills/devkit-*`. Invoke them by name:

- **`/devkit-task`** — the daily workhorse: read context, plan, gate on user approval, implement, run the check loop.
- **`/devkit-commit`** — wrap up a work cycle: inspect diff, draft commit message, optionally capture knowledge / update milestone, commit.

Verification skills are invoked as sub-skills of `/devkit-task`, but you can also call them directly with natural language:

- "lint" / "fix the lint" → `devkit-lint`
- "typecheck" → `devkit-typecheck`
- "run the tests" / "fast tests" → `devkit-test`

## Structure

- `apps/api/` — Hono + Zod backend API (dev port 3001). Houses the TeacherEase scraper (cheerio), the fetch scheduler, and the SMTP email-digest logic ported server-side from the old Tauri/Rust shell, plus Drizzle data access.
- `apps/web/` — Next.js App Router frontend (dev port 3000). The Today / Classes / History / Settings views ported from the desktop app.
- `packages/shared/` — shared Zod schemas and TypeScript types.
- `deploy/chart/` — Helm chart deployed to the home k3s cluster via `arch-infra` (Argo CD GitOps).
- `docs/` — design docs, ADRs, and milestones.

> This is the target layout (mirroring the sibling `homenews` / `homecal` repos); the workspaces are created as the migration proceeds.

## Working with this repo

This project uses **milestone-driven** development:

- **One milestone at a time.** Milestones live in `docs/milestones/NN-*.md`. The active milestone holds the current scope, exit criteria, and progress notes.
- **Plan before code.** `/devkit-task`'s Phase 3 plan-approval gate is non-negotiable, even for one-line fixes. The plan loop catches misunderstandings before they cost real time.
- **Verify before claiming done.** `/devkit-task` runs lint → typecheck → test before reporting success. Retry up to 3x on failure, then surface.
- **Architecture changes need an ADR.** If a significant decision was made (lib choice, boundary move, approach pivot), write a new `docs/adr/NNNN-*.md` from `docs/adr/0000-template.md`.
- **Knowledge is the team-shared memory.** `knowledge/<slug>.md` holds atomic facts, lessons, corrections, references. Capture via natural language ("remember this") or `/devkit-knowledge-capture`. Index at `knowledge/KNOWLEDGE.md`.

### Which file does this go in?

When something needs recording, walk down in order:

1. **A decision** (we chose A over B for reason R) → new ADR.
2. **What we're currently building** (this milestone's scope/plan/notes) → the active `docs/milestones/NN-*.md`.
3. **A change to the system's shape** (components, boundaries) → edit `docs/architecture.md` in place.
4. **A small correction or preference** the agent should remember → new knowledge entry, `type=feedback`.
5. **Non-code project context** (deadlines, constraints, stakeholders) → new knowledge entry, `type=project`.
6. **A URL / ticket / dashboard pointer** → new knowledge entry, `type=reference`.
7. **None of the above** → it probably doesn't need recording.

## Docs

- [`docs/architecture.md`](docs/architecture.md) — current system shape
- [`docs/adr/`](docs/adr/) — append-only decision history
- [`docs/milestones/`](docs/milestones/) — work plans + progress notes
- [`knowledge/KNOWLEDGE.md`](knowledge/KNOWLEDGE.md) — team-shared knowledge index

@knowledge/KNOWLEDGE.md
