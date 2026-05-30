---
name: 06-web-frontend
status: todo
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

- [ ] All views render against the live M04 API; Today/Classes/History show real fetched data
- [ ] Standards drilldown (accordion → `getClassDetail`) works; attention icons + status dots match desktop
- [ ] Settings → Children CRUD works incl. credential validation (`POST /scraper/login`); Fetch "Fetch now" triggers a run; Email config + test send works
- [ ] Setup disclaimer gate blocks first use until acknowledged (`wizard.disclaimerAcknowledgedAt`)
- [ ] Language switcher (en/es/zh) still works end to end
- [ ] No `@tauri-apps/*` imports anywhere in `apps/web`
- [ ] `pnpm lint` + `pnpm build` (Next standalone) pass

## Decisions

**Locked:**
- **Transport swap, not rewrite** — `api.ts` mirrors the `ipc.ts` signatures so components don't change.
- **Drop auto-updater, autostart+tray, OS notifications** (feature cuts above).

**Recommended — please confirm (you initially marked i18n for removal):**
- **KEEP i18n.** Investigation showed it's *fully implemented*: a hand-rolled, zero-dependency pure module with **1,041 finished translations** (347 keys × en/es/zh), wired through React context, used by all major views + email digests + errors. Because every string already flows through `useT()`, **removing it is more work than keeping it** (you'd rip out a working layer and re-hardcode English). It has no Tauri coupling. → Plan keeps it. **If you'd still rather cut it, say so and I'll rewrite this milestone to strip i18n.**

## Open questions

- **`ui.selectedChildId` storage:** server setting (desktop behavior) vs browser `localStorage` (more natural for web). Recommend **localStorage** — it's a per-viewer UI preference, not shared state. Confirm.
- **Appearance settings** (theme/profile/fontSize): keep server-stored (1:1) or move to localStorage too? Recommend localStorage for the same reason. Confirm.
- **Gmail App Password helper page** — port as-is (it's just a static guide), or drop since the digest is now server-side? Recommend **keep** — users still need an app password for SMTP.

## References

- Source frontend: `teacherease-parent-companion/src/` (routes, components, `lib/ipc.ts`, `lib/i18n.ts`, `lib/core/`)
- IPC→HTTP mapping: see M04 endpoints (1:1 with `ipc.ts` functions)
- Web blueprint: `homecal/apps/web/`, `homenews/apps/web/` (`src/lib/api.ts`, Next standalone config)
- Depends on: M04 (API + shared types/engine), M05 (digest endpoints for the email test button)
