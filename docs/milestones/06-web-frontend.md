---
name: 06-web-frontend
status: done
created: 2026-05-30
---

# Milestone 06 — Web frontend port

Port the desktop UI to `apps/web`. The architecture was built for exactly this: **all backend calls already funnel through one file (`src/lib/ipc.ts`)**, designed so swapping it for an HTTP client leaves the React tree untouched. So this is mostly: copy the components, replace `ipc.ts` with `api.ts`, drop the desktop-only features.

## Goal

A browser at `http://localhost:3000` reproduces the desktop app: Today, Classes (with standards drilldown), History, Settings (Children/Fetch/Attention/Email/Appearance), About — all driven by the M04 API.

## Scope / deliverables

Port from `teacherease-parent-companion/src/`:
- **Routes** (`app/`): `(shell)/page.tsx` (Today), `classes/`, `history/`, `settings/[tab]/`, `about/`, `gmail-app-password/`, `setup/` (disclaimer gate)
- **Components** (`components/`): dashboard, status-hero, attention-section, classes-view, grades-table, status-dots, standards-tree, history-view, homework-card, child-switcher, empty-state, about-page, and the settings panels (children, fetch, attention, notifications, email-section, appearance) + the shell layout/sidebar
- **The transport swap:** replace `src/lib/ipc.ts` with `src/lib/api.ts` — an HTTP client whose function signatures match the old IPC facade 1:1, so component code is unchanged. Reuse `packages/shared` types + attention engine.
- **i18n carried over unchanged** (`lib/i18n.ts` + `lib/locales/{en,es,zh}.json` + locale provider) — it's a pure, complete, dependency-free module; see decision below.

### Feature cuts (desktop-only — remove, don't port)

- **Auto-updater** — `settings-advanced` "Check now"/install; Tauri updater plugin. Gone (GitOps deploys).
- **Autostart + system tray** — `setupAutostart`, tray menu, `tray-refresh`. No desktop process.
- **OS notifications** — `notify.refreshDigest.os`, the OS-notification channel + settings toggle. Email-only.
- Trim `settings-advanced` to just **"Reset all data"** + app version (or fold into About). Remove the Notifications-tab OS/scheduling bits that no longer apply; keep the email digest config.

## Exit criteria

- [x] All views render against the live M04 API; Today/Classes/History wired to the API client
- [x] Standards drilldown (accordion → `getClassDetail`) ported; attention icons + status dots preserved
- [x] Settings → Children CRUD incl. credential validation (`POST /scraper/login` via `validateLogin`); Fetch "Fetch now" → `triggerFetch`; Email config + test send (`sendDigestTest`)
- [x] Setup disclaimer gate blocks first use until acknowledged (`wizard.disclaimerAcknowledgedAt`, localStorage)
- [x] ~~Language switcher (en/es/zh)~~ — **i18n cut per decision; English-only** (no switcher)
- [x] No `@tauri-apps/*` imports anywhere in `apps/web` (grep-verified: 0)
- [x] `pnpm lint` + `pnpm typecheck` + `pnpm build` (Next standalone) pass

## Decisions

**Locked:**
- **Transport swap, not rewrite** — `api.ts` mirrors the `ipc.ts` signatures so components don't change.
- **Drop auto-updater, autostart+tray, OS notifications** (feature cuts above).

**Decided this session:**
- **CUT i18n — English-only.** Despite i18n being fully implemented, the user chose to strip it
  (matches the server-side digest's English-only decision). Every `useT()("key")` was replaced with
  the literal English string from `en.json`. No `i18n.ts` / `locales/` / `LocaleProvider` / language
  switcher in the web port.
- **Per-viewer UI prefs in `localStorage`** — `ui.selectedChildId`, `appearance.theme/profile/fontSize`,
  `ui.sidebarCollapsed`, and the disclaimer ack (`wizard.disclaimerAcknowledgedAt`) live in the
  browser via `@/hooks/use-pref` + `use-selected-child`. DB stays UTC; UI works in local tz.
- **Dropped the Gmail App Password helper page** (route + component not ported).

## Resolved open questions

- selectedChildId / appearance → **localStorage** (above).
- Gmail helper → **dropped** (above).

## References

- Source frontend: `teacherease-parent-companion/src/` (routes, components, `lib/ipc.ts`, `lib/i18n.ts`, `lib/core/`)
- IPC→HTTP mapping: see M04 endpoints (1:1 with `ipc.ts` functions)
- Web blueprint: `homecal/apps/web/`, `homenews/apps/web/` (`src/lib/api.ts`, Next standalone config)
- Depends on: M04 (API + shared types/engine), M05 (digest endpoints for the email test button)

## Progress

- **Foundation:** `apps/web/package.json` (dropped all `@tauri-apps/*` + `cheerio` + `better-sqlite3`;
  added `radix-ui`, `tw-animate-css`, `vitest`); `globals.css` ported (Tailwind-v4 `@theme` + 5 theme
  profiles + dark variant); 7 shadcn `ui/` primitives copied verbatim; `lib/{legal,local-date,
  hero-statuses}.ts`, `lib/core/{theme,sort,activity}.ts`; `hooks/{use-pref,use-selected-child}.ts`
  (localStorage, uuid string ids).
- **`lib/api.ts`** — the transport swap: named functions mirroring the desktop `ipc.ts` surface
  (children CRUD, fetch trigger/runs, grades/classes/standards, homework, settings, scraper validate,
  digest send/test, app reset/version), re-exporting `@homework/shared` types. Desktop-only IPC
  (scheduler tick, tray events, updater, autostart, OS log, direct SMTP) dropped. `+ api.test.ts`
  (mocked fetch). Added two API routes: `GET /api/fetch-runs/:id/{grades,assignments}`.
- **~33 components ported** across shell / Today / Classes / History / Settings / Setup+About,
  applying: `ipc → api`, `core/* engine → @homework/shared`, `useT()` → English literals,
  `number → string` ids, no Tauri. Not ported (deleted concepts): `schedulers.tsx`,
  `locale-provider.tsx`, the frontend fetch/scraper/notify pipelines, updater, autostart,
  OS-notification channel, gmail-app-password page. Settings trimmed: notifications = email-only,
  advanced = reset + version, appearance → localStorage (no language picker).
- **`next.config.mjs`** — `output: standalone` + `transpilePackages: ["@homework/shared"]` + a webpack
  `extensionAlias` mapping `.js` specifiers → `.ts/.tsx` (the shared package + our lib use NodeNext
  `.js` import extensions; webpack needs the alias).
- **`lib/schedule-helpers.ts`** (new, web-local) — desktop-named cadence helpers
  (`computeFetchSlots`/`parseFetchRunsPerDay`/`formatSlotMinutes`/…) as thin wrappers over shared's
  `computeSlots`, since shared only exposes the primitive. Settings Fetch/Notifications use it.

## Outcome

Web frontend ported. Check loop **all green**: `pnpm lint` · `pnpm typecheck` (4/4) · `pnpm build`
(Next standalone, all 8 routes compiled). Live smoke against the running API+web: all routes serve
200 (Today, Classes, History, Settings/children, About, Setup); `grep @tauri-apps apps/web/src` → 0;
about page renders the app name, setup renders the disclaimer, no raw i18n keys leak into HTML; the
data path works end-to-end (create child via API → list=1 → `/grades` returns empty array, not 500,
with uuid ids). Decisions realized: **i18n cut (English-only)**, **UI prefs in localStorage**, Gmail
helper dropped.

**Built layer-by-layer**, parallelizing the five view layers across subagents over a shared
transform spec (ipc→api, English literals, uuid string ids, no Tauri); foundation + `api.ts` were
written first by hand since everything depends on their exactness.
