---
name: 07-deploy-gitops
status: done
created: 2026-05-30
---

# Milestone 07 — Deploy & GitOps

Containerize, write the Helm chart, wire CI, and register the app with `arch-infra` so `git push origin main` deploys to the home k3s cluster the same way homenews/homecal do.

## Goal

Pushing to `main` builds + pushes `ghcr.io/autumnfallenwang/homework-{api,web}`, bumps the tags in `arch-infra`, and Argo CD rolls the pods. App reachable at `http://homework.arch.local` (web) and `http://homework-api.arch.local` (API), backed by an in-cluster Postgres.

## Scope / deliverables

`deploy/`:
- `Dockerfile.api` — `node:22-alpine`, copies root + `packages/shared` + `apps/api` + `drizzle.config.ts` + **`drizzle/`** (migrations), `start: pnpm --filter @homework/api start`, EXPOSE 52001, non-root `node` user. Add `TZ` env (see open Q).
- `Dockerfile.web` — multi-stage; builder runs `next build` with `NEXT_PUBLIC_API_URL=http://homework-api.arch.local` baked in; production copies standalone output, EXPOSE 52000, `node apps/web/server.js`
- `compose.yaml` — local full-stack bring-up (optional, homenews has one)

`deploy/chart/` (base on **homecal**, the more mature chart):
- `Chart.yaml`, `values.yaml`
- `templates/`: `deployment-api.yaml` (**`Recreate` strategy, replicas=1** — singleton scheduler), `deployment-web.yaml`, `statefulset-db.yaml` (`postgres:17-alpine`, 5Gi local-path PVC), `service-{api,web,db}.yaml` (ClusterIP :80 → 52001/52000), `ingress-{api,web}.yaml` (Traefik, `homework{,-api}.arch.local`), `job-migrate.yaml` (pre-install/upgrade hook, `migrate.enabled` default false), `_helpers.tpl`
- Image refs `ghcr.io/autumnfallenwang/homework-{api,web}`; runtime `API_URL=http://homework-api` (same-namespace Service DNS)

`.github/workflows/build.yml`:
- `test` job — pnpm 10.29.3 + Node 22, `pnpm test:fast` with a dummy `DATABASE_URL`
- `build-and-deploy` (main only) — matrix `[api, web]`, push `:latest` + `:<SHA>`, web build-arg `NEXT_PUBLIC_API_URL`
- `bump-arch-infra` — clone arch-infra via `ARCH_INFRA_TOKEN`, `yq` bump `api.image.tag` + `web.image.tag` in `apps/homework.yaml`

`arch-infra` (separate repo, `/home/aaronwang/github/arch-infra/`):
- `apps/homework.yaml` — Argo CD Application CR (repoURL = homework repo, `path: deploy/chart`, namespace `homework`, automated sync prune+selfHeal, `CreateNamespace=true`, helm params for image tags + `migrate.enabled`)

## Exit criteria

- [x] Both images build locally (`docker build -f deploy/Dockerfile.{api,web} .`) and run
- [x] `helm template deploy/chart` renders valid manifests; `helm lint` clean
- [x] Full stack verified via `docker compose` on the prod images: db healthy, migrate path
  (`drizzle-kit migrate`) applies schema, api `/health`=ok, web serves, **web→api in-container hop
  returns `{"status":"ok"}`**, child CRUD persists, pino JSON w/ `TZ=America/New_York`
- [x] `apps/homework.yaml` committed to arch-infra `main` (`d2e3e80`) — **awaiting your push**
- [ ] *(cluster-only, your push)* First Argo sync: ns created, db Ready, flip `migrate.enabled=true`, pods Ready
- [ ] *(cluster-only)* `http://homework.arch.local` + `http://homework-api.arch.local/health` via ingress
- [ ] *(cluster-only)* `git push origin main` → GHA → arch-infra bump → Argo rolls pods
- [ ] *(cluster-only)* Logs in Loki (`{namespace="homework"}`); scheduler fires in-cluster; real digest sends

## Decisions (locked)

- **homecal chart as baseline** — it has the migration Job + Secret pattern homework needs.
- **Single api Deployment, `Recreate`, replicas=1** — the in-process scheduler must be a singleton.
- **Postgres in-cluster** via StatefulSet (homecal style), not an external/managed DB.
- **SMTP/portal passwords:** plaintext in Postgres (locked in M02). The only k8s **Secret** needed is `DATABASE_URL`/`POSTGRES_PASSWORD` (and optionally a default `TZ`); everything else is user-configured via Settings.

## Resolved open questions

- **Cluster timezone** → **`America/New_York`** (set as `api.env.TZ` in values.yaml; matches `config.tz`).
- **Secret creation** → replicated homecal's `scripts/create-cluster-secret.sh` + gitignored
  `cluster-secrets.env` (two keys: `DATABASE_URL`, `POSTGRES_PASSWORD`). Sealed Secrets deferred.
- **arch-infra commit** → committed `apps/homework.yaml` **directly to arch-infra main** (`d2e3e80`),
  per user choice. Not pushed (user pushes).

## Progress

- **`deploy/`**: `Dockerfile.api` (node:22-alpine, pnpm@10.29.3, bakes `drizzle/`), `Dockerfile.web`
  (multi-stage standalone, `NEXT_PUBLIC_API_URL` build-arg — no auth URL), `compose.yaml`
  (postgres:17-alpine + api + web), `cluster-secrets.env.example`, and the full `chart/` (homecal
  pattern, stripped of auth/LLM/APNS/SMTP env): api Deployment **Recreate**, web Deployment, db
  StatefulSet (PGDATA subdir, headless svc), services, Traefik ingresses
  (`homework{,-api}.arch.local`), gated pre-install migrate Job. `scripts/create-cluster-secret.sh`.
- **CI** `.github/workflows/build.yml`: test (dummy DATABASE_URL → `test:fast`) → build-and-deploy
  (matrix api/web → GHCR `:latest`+`:sha`, web `NEXT_PUBLIC_API_URL` build-arg) → bump-arch-infra
  (`yq` bumps api+web `image.tag` in `apps/homework.yaml` via `ARCH_INFRA_TOKEN`).
- **arch-infra** `apps/homework.yaml` (committed to its main): Argo CD Application → homework repo
  `deploy/chart`, ns `homework`, automated prune+selfHeal, CreateNamespace+ServerSideApply. A
  review copy also lives at `deploy/arch-infra/homework.yaml` in this repo.
- **Incidental fix:** `apps/web` had no `public/` dir, so `Dockerfile.web`'s `COPY public` failed —
  added `apps/web/public/.gitkeep` (conventional for Next; build now succeeds).

## Outcome

Everything locally verifiable is **green**: both images build, `helm lint`/`template` clean, the
prod images run as a full stack under compose (health, web routes, web→api hop, data persistence,
pino+TZ all confirmed), and the repo check loop passes. arch-infra is registered (committed, awaiting
push). What remains is inherently cluster-side and needs your `git push` + `kubectl`/Argo on the live
k3s box — documented in the exit criteria above. The standing prerequisites for that first deploy:
(1) run `scripts/create-cluster-secret.sh` with a real `cluster-secrets.env`, (2) push both repos,
(3) after the db is up, flip `migrate.enabled=true` in `apps/homework.yaml`, (4) ensure the
`ARCH_INFRA_TOKEN` + GHCR-package-public bits are set as the siblings document.

## References

- arch-infra model: `arch-infra/README.md`, `arch-infra/apps/homecal.yaml`, `apps/homenews.yaml`
- Deploy blueprint: `homecal/deploy/` (Dockerfiles, chart, job-migrate), `homecal/.github/workflows/build.yml`, `homecal/scripts/create-cluster-secret.sh`
- Cluster ops reference: the "Cluster ops" sections of `homecal/CLAUDE.md` and `homenews/CLAUDE.md`
- Depends on: M01–M06 (a working full-stack app to ship)
