import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

// postgres-js connects lazily (no socket is opened until the first query), so
// constructing the client here is safe even when DATABASE_URL is unset — e.g.
// route unit tests that only exercise request validation and never hit the DB.
// The server entry (index.ts) verifies DATABASE_URL before it runs any query.
const databaseUrl = process.env.DATABASE_URL ?? "postgres://localhost:5432/homework";

const client = postgres(databaseUrl);
// casing: "snake_case" — DB columns are snake_case (Postgres convention, and
// matches the source SQLite schema). This must match drizzle.config.ts so the
// generated DDL and runtime SQL (incl. ON CONFLICT targets) agree.
export const db = drizzle(client, { schema, casing: "snake_case" });

export type Database = typeof db;

/** Close the connection pool. Used by integration tests so vitest can exit. */
export async function closeDb(): Promise<void> {
  await client.end();
}
