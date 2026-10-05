---
name: css-zoom-radix-popper
description: the app's font size is CSS `zoom` on <html>; Radix popper menus land zoom× off unless globals.css un-zooms their wrapper — test pop-ups at a font size above 1
metadata:
  type: feedback
---

The Appearance font size is `zoom: var(--font-scale)` on `<html>` (globals.css, ThemeProvider).
Radix popper content (DropdownMenu, and any Popover / Tooltip / Select added later) positions its
`[data-radix-popper-content-wrapper]` with a translate taken from on-screen coordinates, and the
zoom multiplies it again: at 1.25 a menu opened 1.25× as far from the top-left as its button
(prod, 2026-10-04, the list ⋮ menus), while dev at the default size looked fine.

globals.css un-zooms the wrapper (`zoom: calc(1 / var(--font-scale, 1))`) and re-zooms its child,
so the position is right and the menu text still follows the font size.

**Why:** dev runs at font scale 1 and prod has the founder's larger setting, so pop-up bugs
only show in prod.
**How to apply:** for any new floating UI, check it in dev with
`document.documentElement.style.setProperty('--font-scale', '1.25')` before release; anything
positioned from `getBoundingClientRect` inside the zoomed page has the same trap.
