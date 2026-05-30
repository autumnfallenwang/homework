import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}

const client = postgres(databaseUrl);
// casing: "snake_case" — DB columns are snake_case (Postgres convention, and
// matches the source SQLite schema). This must match drizzle.config.ts so the
// generated DDL and runtime SQL (incl. ON CONFLICT targets) agree.
export const db = drizzle(client, { schema, casing: "snake_case" });

export type Database = typeof db;
