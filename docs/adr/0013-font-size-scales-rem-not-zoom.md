# 0013 — The font-size setting scales rem, not CSS zoom

- **Status:** accepted
- **Date:** 2026-10-04
- **Deciders:** project founder

## Context

Since the port (M06), Settings → Appearance → Font size (Small 1.0 / Medium 1.15 / Large 1.3, or
custom 0.5–2.0, kept per browser) set `zoom: var(--font-scale)` on `<html>`. Zoom was chosen
because most text used `text-[Npx]` classes, which a root font size does not reach; the page
heights then needed `calc(100vh / var(--font-scale))` in seven places.

The list ⋮ menus (ADR 0012) were the first floating UI. In prod, at the founder's larger font
size, each menu opened far from its button: Radix (Floating UI) positions from on-screen
coordinates and the zoom multiplied them again (1.25× as far from the corner at 1.25). Un-zooming
the menu wrapper fixed desktop and Chrome zoom (8360bb6) but not a phone's pinch-zoom combined with
a larger font size, and Safari and Firefox implement `zoom` differently again. The founder asked
for a production-proven way that holds under every kind of zoom.

## Decision

- The setting scales the **root font size**: `html { font-size: calc(100% * var(--font-scale)) }`.
  `100%` keeps the browser's own font-size preference underneath it. No CSS `zoom` anywhere.
- Everything that should grow with the text is in **rem**: all text sizes (`text-[0.8125rem]`,
  never `text-[13px]`), Tailwind spacing and icons (rem already), and the few fixed sizes that sit
  next to text (row heights, the done circle, grid column widths, the switch knob). Hairlines
  stay px: borders, focus rings, shadows.
- Page heights are `100dvh` (the visible screen, minus a phone's browser bars) without
  compensation.
- Floating UI stays **Radix** (DropdownMenu, on Floating UI): the standard choice, which handles
  browser zoom, pinch-zoom, flipping and keeping the menu on screen once the page's coordinates
  are not distorted.

Considered and rejected:
- *Keep zoom, un-zoom each floating wrapper (8360bb6)*: fixed desktop only; breaks with
  pinch-zoom and depends on how each engine implements `zoom`.
- *Menus without Floating UI (absolutely positioned in the row)*: immune to zoom, but clipped by
  scroll areas and never flips at the screen's edge.
- *Native CSS anchor positioning*: the browser would place the menu, but it isn't in every
  browser this family uses yet.

## Consequences

**Positive:** Chrome zoom, pinch-zoom, the app's font size and the browser's font-size
preference all combine; any later popover, tooltip or select works without special cases; at
Small (1.0) the page is pixel-for-pixel what it was.

**Negative / risks:**
- At Medium / Large, borders, focus rings and shadows no longer grow with the text (they did
  under zoom); layout breakpoints (`md:`) stay at the same screen widths as before.
- New code must size text in rem: a `text-[13px]` will not follow the setting.

## Notes

- Replaces the `zoom` choice made in the desktop port (M06); reverts 8360bb6's wrapper rule.
- Tested in dev: menus at Chrome zoom 80–200%, pinch-zoom 1–3×, font size 1–1.5 (every
  combination opens next to its button, flipping above when there is no room below).
