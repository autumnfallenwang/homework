---
name: biome-tailwind-css
description: biome.json needs css.parser.tailwindDirectives=true (and $schema pinned to the installed CLI version) or lint fails on Tailwind v4 CSS.
metadata:
  type: feedback
---

`biome.json` in this repo sets `"css": { "parser": { "tailwindDirectives": true } }` and pins `"$schema"` to the **installed** biome CLI version.

**Why:**
- Without `tailwindDirectives`, `pnpm biome check` fails with a fatal CSS parse error on `apps/web/src/app/globals.css` — Tailwind v4's `@import "tailwindcss"` + `@theme {}` blocks aren't valid plain CSS, so biome's default CSS parser rejects them and aborts the whole check. homecal's biome.json has this same option for the same reason.
- The `$schema` URL version must match the installed CLI (currently `2.4.16`). A mismatched version (e.g. `2.4.4`) makes biome emit a fatal `deserialize` config-version error before any linting runs. Run `pnpm exec biome --version` and pin to that.

**How to apply:** Keep both settings when editing biome.json. If lint suddenly fails with "Tailwind-specific syntax is disabled" the `tailwindDirectives` flag was dropped; if it fails with "configuration schema version does not match", bump `$schema` to the installed version. Related: [[project-profile]].
