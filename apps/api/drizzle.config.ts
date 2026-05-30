import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  // Emit snake_case columns (Postgres convention + matches the source schema).
  // Must match the `casing` passed to drizzle() in src/db/index.ts.
  casing: "snake_case",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
