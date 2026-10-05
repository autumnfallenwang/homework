---
name: font-size-rem-not-zoom
description: the Appearance font size scales the root font size (ADR 0013) — size text in rem (text-[0.8125rem], never text-[Npx]), no CSS zoom; check floating UI at font 1.25 + Chrome zoom + pinch
metadata:
  type: feedback
---

Settings → Appearance → Font size sets `--font-scale` on `<html>`, and globals.css turns it into
`font-size: calc(100% * var(--font-scale))` (ADR 0013). Only rem-sized things follow it: write text
as `text-[0.8125rem]` (13 px ÷ 16) or a Tailwind `text-sm`, never `text-[13px]`; fixed sizes next
to text (row heights, circles, grid columns) in rem too; borders / rings / shadows stay px.

Never bring back CSS `zoom` on the page: it distorts the coordinates Radix / Floating UI read, so
menus opened zoom× away from their button in prod (2026-10-04), and no wrapper fix survived
pinch-zoom on a phone.

**Why:** dev runs at font size 1 and the founder's prod browser at a larger one, so size bugs
only show in prod.
**How to apply:** before releasing floating UI or a layout change, check in dev with
`document.documentElement.style.setProperty('--font-scale', '1.25')`, a Chrome-zoom context
(viewport ÷ Z, `deviceScaleFactor: Z`) and pinch (`Emulation.setPageScaleFactor`; open menus by
keyboard there — Playwright taps miss under emulated pinch).
