---
name: project-profile
description: Seeded by /devkit-init on 2026-05-30. Captures who this project is and what shape it has.
metadata:
  type: project
---

# homework

Migration of the TeacherEase Parent Companion desktop app to a self-hosted, k3s-deployed full-stack web app (with room to grow).

## What this project is

homework is a migration of the TeacherEase Parent Companion desktop app into a self-hosted full-stack web app on the home k3s cluster — a parent-facing tool that scrapes a child's TeacherEase portal for grades and homework and surfaces what needs attention, with daily email digests. Currently scoped to a 1:1 port of the desktop app onto the deployed stack.

## Stack at a glance

- **Primary language:** typescript
- **Package manager:** pnpm

- **Language:** TypeScript
- **Monorepo:** Turborepo + pnpm
- **Backend:** Hono + Zod (`apps/api`)
- **Frontend:** Next.js App Router (`apps/web`)
- **Database:** PostgreSQL + Drizzle
- **Shared:** Zod schemas + types (`packages/shared`)
- **Test:** Vitest
- **Lint / format:** Biome
- **Deploy:** k3s + Argo CD via `arch-infra`, GHCR images, Helm chart at `deploy/chart`

## Why future-you should keep this entry up to date

This is `type: project`, meaning it's a live cache of project-level context — not history. As the project evolves (new components, removed deps, shifted scope), update this file. Delete it entirely if the project changes shape so fundamentally that the brainstorm answers no longer apply, and capture a fresh one.
