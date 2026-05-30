---
name: 01-monorepo-bootstrap
status: done
created: 2026-05-30
---

# Milestone 01 — Monorepo bootstrap

Stand up the empty Turborepo skeleton that mirrors `homenews`/`homecal` exactly, so every later milestone has the right home. No business logic yet — just the scaffold, tooling, and a green dev loop with the web→api hop working end to end.

## Goal

`pnpm dev` brings up `apps/api` (Hono, :3001), `apps/web` (Next.js, :3000), and a local Postgres (:5432) container; the web app fetches `/health` from the API and renders "ok". `pnpm build`, `pnpm lint`, `pnpm test:fast` all pass on an empty repo.

## Scope / deliverables

Root tooling (copy the house pattern — homecal is the canonical baseline):
- `pnpm-workspace.yaml` → `packages: ["apps/*", "packages/*"]`
- `turbo.json` — `dev`, `build`, `test`, `test:fast`, `lint`, `lint:fix` pipelines
- root `package.json` — `packageManager: pnpm@10.29.3`, turbo scripts, `predev: ./scripts/db-start.sh`
- root `tsconfig.json` (ES2022, strict), `biome.json` (line width 100), `.gitignore`, `.dockerignore`

`apps/api/` (Hono on `@hono/node-server`):
- `src/index.ts` — HTTP server on `process.env.API_PORT ?? 3001`
- `src/app.ts` — Hono app, `requestLog` middleware, CORS, `GET /health → {status:"ok"}`
- `src/config.ts` — env loading (`DATABASE_URL`, `API_PORT`, `LOG_LEVEL`)
- `package.json` (`@homework/api`): `dev: tsx watch --env-file=.env src/index.ts`, `start: tsx src/index.ts`, `test`, `test:fast`, `lint`
- `.env.example` — `DATABASE_URL=postgresql://homework:homework@localhost:5432/homework`

`apps/web/` (Next.js App Router):
- `src/lib/api.ts` — dual-context base URL: `API_URL ?? NEXT_PUBLIC_API_URL ?? http://localhost:3001`
- `src/app/layout.tsx` + a placeholder home page that calls `/health` and shows the result
- `package.json` (`@homework/web`): `dev: next dev --port 3000`, `build`, `start`, `lint`
- `next.config.mjs` (standalone output), Tailwind + shadcn baseline

`packages/shared/` (`@homework/shared`):
- `src/index.ts` — empty barrel for now (Zod schemas land in M04)
- `package.json` (dep: `zod`), `tsconfig.json`

`scripts/`:
- `db-start.sh` / `db-stop.sh` / `db-reset.sh` — local `homework-postgres` container, `postgres:17-alpine`, volume `homework-pgdata`, host port 5432, creds `homework/homework/homework`, `pg_isready` wait loop

## Exit criteria

- [x] `pnpm install` clean on a fresh clone
- [x] `pnpm dev` starts db + api + web; `http://localhost:3000` shows API `/health` = ok — **fully verified** with Docker Postgres up + both servers running: API `/health`→`200 {"status":"ok"}`, web SSR rendered `API health: ok` (HTTP 200), psql query OK
- [x] `pnpm build` and `pnpm test:fast` and `pnpm lint` all pass
- [x] `apps/web/src/lib/api.ts` resolves the API URL with no env config in dev
- [x] Workspaces resolve: `apps/web` and `apps/api` can both import `@homework/shared`

## Decisions (locked)

- **DB image:** `postgres:17-alpine` (homecal style). The source app stores no vectors/embeddings, so pgvector is unnecessary.
- **Ports:** local api 3001 / web 3000 / db 5432; cluster api 52001 / web 52000 (set in M07).
- **Package names:** `@homework/{api,web,shared}`; images `ghcr.io/autumnfallenwang/homework-{api,web}`.

## Open questions

- None blocking. (Auth is out of scope for the whole migration — single-user, LAN-only — so no Better Auth scaffolding, unlike homecal.)

## Progress

- 2026-05-30: Scaffolded the Turborepo skeleton — root tooling (pnpm-workspace, turbo.json, tsconfig, biome, .gitignore, .dockerignore), `apps/api` (Hono + `/health` + requestLogger + config), `apps/web` (Next.js App Router, dual-context `api.ts`, Tailwind v4 baseline, `/health` page), `packages/shared` (placeholder export), and `scripts/db-{start,stop,reset}.sh`. Check loop green: lint ✓ typecheck ✓ test:fast (1) ✓ build (api+web) ✓.
- 2026-05-30: Full end-to-end verification with Docker — `scripts/db-start.sh` brought up `homework-postgres` (postgres:17-alpine, :5432); ran api (:3001) + web (:3000); API `/health`→200 `{"status":"ok"}`, web SSR page rendered `API health: ok`, psql `SELECT` OK, `@homework/shared` symlinked into both apps. **All M01 exit criteria met.**

### Build notes / deviations
- Added `@biomejs/biome` to root devDependencies + `onlyBuiltDependencies` (was referenced by lint scripts but not installed).
- `packages/shared/src/index.ts` uses a real `export const SHARED_PACKAGE` rather than `export {}` — biome's `noUselessEmptyExport` strips empty exports, which broke `isolatedModules`.
- `apps/api` `build` is `tsc --noEmit` (not `tsc`): the API runs via `tsx` at runtime (dev + prod Docker), so no emitted `dist/` is needed, and `--noEmit` sidesteps the cross-package `rootDir` constraint from importing `@homework/shared` source.
- `apps/web/src/app/page.tsx` is `force-dynamic` (reads live API state at request time, not build time); `globals.css` defines a minimal Tailwind v4 `@theme` baseline.
- `apps/web/tsconfig.json` needed `baseUrl: "."` for the `@/*` path alias to resolve.
- `biome.json` needs `css.parser.tailwindDirectives: true` (as homecal has) so biome can parse Tailwind v4's `@theme`/`@import "tailwindcss"` in `globals.css` — without it, lint fails with a CSS parse error. The `$schema` is pinned to the installed CLI version (`2.4.16`); an older value triggers a fatal config-version error.

## References

- Blueprint: `homecal/` and `homenews/` repos (layout, turbo.json, biome.json, scripts/db-start.sh)
- `docs/architecture.md` — target layout
- `docs/adr/0001-initial-stack.md` — stack rationale

## Outcome

Closed: 2026-05-30. Shipped the Turborepo + pnpm skeleton (`apps/api` Hono, `apps/web` Next.js, `packages/shared`) following the homecal/homenews house pattern. All exit criteria met and verified end-to-end against Docker Postgres: lint/typecheck/test/build green, and the live web→api `/health` hop renders `ok`. Minor deviations (logged in Build Notes): added `@biomejs/biome` to root deps; `apps/api build` is `tsc --noEmit` (runtime is `tsx`); `biome.json` carries `css.parser.tailwindDirectives` for Tailwind v4 and pins `$schema` to the installed 2.4.16.
