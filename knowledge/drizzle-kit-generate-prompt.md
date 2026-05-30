---
name: drizzle-kit-generate-prompt
description: Run `drizzle-kit generate` with stdin closed (`< /dev/null`) — its interactive rename prompt loops non-interactively and drops self-referencing tables.
metadata:
  type: feedback
---

Always run `pnpm --filter @homework/api db:generate` (i.e. `drizzle-kit generate`) with **stdin closed and an explicit name**: `pnpm exec drizzle-kit generate --name <name> < /dev/null`.

**Why:** The first M02 generate was run through a normal pnpm wrapper without a TTY. drizzle-kit hit an interactive "is this table created or renamed?" prompt (triggered by the self-referencing `standards.parentId → standards.id` FK), read EOF repeatedly, and (a) **dropped the `standards` table entirely** from the migration — output said "8 tables" not 9 — and (b) spammed 24 empty migration files (`0001`–`0025`). Re-running with `--name init < /dev/null` after `rm -rf drizzle/` produced a single clean `0000_init.sql` with all 9 tables.

**How to apply:** If `db:generate` ever reports fewer tables than expected or creates 0-byte migration files, that's the prompt loop — `rm -rf apps/api/drizzle`, then regenerate with `< /dev/null` and `--name`. Verify the result: `grep -c 'CREATE TABLE' apps/api/drizzle/0000_*.sql` should equal the table count. Related: [[biome-tailwind-css]].
