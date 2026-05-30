---
name: 07-deploy-gitops
status: todo
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

- [ ] Both images build locally (`docker build -f deploy/Dockerfile.api .`) and run
- [ ] `helm template deploy/chart` renders valid manifests; `helm lint` clean
- [ ] First deploy: namespace created, db StatefulSet healthy, migration Job applies schema (flip `migrate.enabled=true` after first sync), api + web pods Ready
- [ ] `http://homework.arch.local` serves the app; `http://homework-api.arch.local/health` = ok; web→api hop works in-cluster
- [ ] `git push origin main` → GHA green → arch-infra bumped → Argo CD rolls both pods (end-to-end ~3–5 min)
- [ ] Logs land in Loki (`{namespace="homework"}` in Grafana)
- [ ] Scheduler fires in-cluster on cadence; a real digest email sends

## Decisions (locked)

- **homecal chart as baseline** — it has the migration Job + Secret pattern homework needs.
- **Single api Deployment, `Recreate`, replicas=1** — the in-process scheduler must be a singleton.
- **Postgres in-cluster** via StatefulSet (homecal style), not an external/managed DB.
- **SMTP/portal passwords:** plaintext in Postgres (locked in M02). The only k8s **Secret** needed is `DATABASE_URL`/`POSTGRES_PASSWORD` (and optionally a default `TZ`); everything else is user-configured via Settings.

## Open questions

- **Cluster timezone** (carried from M05): the scheduler + digest "today" must match the family's local time. **What `TZ` should the api Deployment use?** (e.g. `America/Chicago`?) Needs your answer before the digest cadence is correct.
- **Secret creation:** homecal uses a `create-cluster-secret.sh` from a gitignored `cluster-secrets.env`. Replicate that for homework's `DATABASE_URL`/`POSTGRES_PASSWORD`? Recommend yes (same pattern). Sealed Secrets is also available per arch-infra — either works; confirm preference.
- **arch-infra commit:** I can prepare `apps/homework.yaml` but registering it is a change to a *different* repo. Want me to open a PR there, or hand you the file to commit?

## References

- arch-infra model: `arch-infra/README.md`, `arch-infra/apps/homecal.yaml`, `apps/homenews.yaml`
- Deploy blueprint: `homecal/deploy/` (Dockerfiles, chart, job-migrate), `homecal/.github/workflows/build.yml`, `homecal/scripts/create-cluster-secret.sh`
- Cluster ops reference: the "Cluster ops" sections of `homecal/CLAUDE.md` and `homenews/CLAUDE.md`
- Depends on: M01–M06 (a working full-stack app to ship)
