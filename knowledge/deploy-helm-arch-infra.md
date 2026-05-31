---
name: deploy-helm-arch-infra
description: Deploy follows the homecal pattern — deploy/Dockerfile.{api,web} + deploy/chart (api Recreate/singleton, db StatefulSet, gated migrate Job) + CI→GHCR + apps/homework.yaml in arch-infra. TZ=America/New_York, LOG_LEVEL=info, 2 secrets only.
metadata:
  type: reference
---

M07 mirrors homecal's deploy tree (`homecal → homework`, auth/LLM/APNS/SMTP env stripped).

- **Images:** `ghcr.io/autumnfallenwang/homework-{api,web}`. `deploy/Dockerfile.api` (node:22-alpine,
  pnpm@10.29.3, bakes `apps/api/drizzle/`); `deploy/Dockerfile.web` (multi-stage standalone, build-arg
  `NEXT_PUBLIC_API_URL` only — no auth). The web image needs `apps/web/public/` to exist
  (`.gitkeep` keeps it) or `COPY public` fails the build.
- **Chart `deploy/chart`:** api Deployment **`Recreate`/replicas=1** (scheduler is a singleton — never
  scale or RollingUpdate); web Deployment RollingUpdate; db StatefulSet `postgres:17-alpine` (PGDATA
  subdir, headless service); Traefik ingresses `homework.arch.local` + `homework-api.arch.local`;
  pre-install/upgrade **migrate Job gated `migrate.enabled=false`** (flip true after secret+db exist).
  Ports 52001 (api) / 52000 (web). `api.env.TZ=America/New_York`, `LOG_LEVEL=info` (both).
- **Secrets:** only `DATABASE_URL` + `POSTGRES_PASSWORD` (SMTP/portal passwords live in Postgres).
  Create out-of-band: `scripts/create-cluster-secret.sh` reads gitignored `cluster-secrets.env`
  → `homework-secrets` Secret. `web.env.API_URL=http://homework-api` (in-cluster Service DNS) for SSR.
- **CI** `.github/workflows/build.yml`: test (dummy `DATABASE_URL`, `test:fast`) → build-and-deploy
  (matrix api/web, GHCR `:latest`+`:sha`) → bump-arch-infra (`yq` sets api+web `image.tag` in
  `apps/homework.yaml`, needs `ARCH_INFRA_TOKEN` GH secret with write to arch-infra).
- **arch-infra:** `apps/homework.yaml` (Argo CD Application → homework repo `deploy/chart`, ns
  `homework`, automated prune+selfHeal, CreateNamespace+ServerSideApply). A review copy lives at
  `deploy/arch-infra/homework.yaml` in this repo — keep the two in sync.

**First-deploy runbook (cluster-side, manual):** `create-cluster-secret.sh` → push homework + arch-infra
→ Argo syncs (brief ImagePullBackOff until GHCR packages exist + are public) → flip
`migrate.enabled=true` → migrate Job applies `0000_init.sql` → pods Ready. **Local verification** that
needs no cluster: `docker build` both, `helm lint`/`template`, `docker compose -f deploy/compose.yaml
up` (migrate the compose DB once with `drizzle-kit migrate`, since compose has no Job). Related:
[[logging-pino-loki]], [[scheduler-nodecron-slots]].
