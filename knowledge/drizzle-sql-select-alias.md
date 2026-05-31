---
name: drizzle-sql-select-alias
description: A raw sql`...` expression used as a value in a Drizzle .select({...}) projection must be .as("alias")'d, or tsc fails with TS2769 "No overload matches this call".
metadata:
  type: feedback
---

When building an aggregate/computed Drizzle query, any bare ``sql`...` `` placed as a
**value inside a `.select({ ... })` projection** must be aliased with `.as("name")`.
Without it, `tsc` rejects the whole call with **TS2769 "No overload matches this call"**
(the projection type expects columns or `SQL.Aliased`, not a bare `SQL`).

**Why:** In `getHomeworkMonths` (`apps/api/src/db/queries.ts`) the first cut was
`.select({ yearMonth: ym, count: sql<number>\`count(*)::int\` })` where `ym` was a bare
`sql` — typecheck failed. `.groupBy()` / `.orderBy()` accept a bare `SQL` fine; only the
**select projection** needs the alias.

**How to apply:** alias the projection values and keep a separate unaliased expression for
group/order:
```ts
const ym = sql`substring(${homework.hwDate} from 1 for 7)`;
await db.select({
  yearMonth: sql<string>`substring(${homework.hwDate} from 1 for 7)`.as("year_month"),
  count: sql<number>`count(*)::int`.as("cnt"),
}).from(homework).groupBy(ym).orderBy(desc(ym));
```
Also: a plain projected column select can occasionally hit the same overload noise in a longer
chain — falling back to `.select()` (full row) is the simplest always-valid overload.
Related: [[drizzle-casing-onconflict]].
