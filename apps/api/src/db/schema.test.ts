import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  assignments,
  children,
  classes,
  fetchRuns,
  grades,
  homework,
  rawPayloads,
  settings,
  standards,
} from "./schema.js";

describe("schema shape", () => {
  it("defines all 9 tables with the expected SQL names", () => {
    const names = [
      children,
      settings,
      fetchRuns,
      rawPayloads,
      classes,
      standards,
      grades,
      assignments,
      homework,
    ].map((t) => getTableConfig(t).name);

    expect(names).toEqual([
      "children",
      "settings",
      "fetch_runs",
      "raw_payloads",
      "classes",
      "standards",
      "grades",
      "assignments",
      "homework",
    ]);
  });

  it("keeps portalPassword nullable on children (plaintext, optional)", () => {
    const cols = getTableColumns(children);
    expect(cols.portalPassword.notNull).toBe(false);
    expect(cols.displayName.notNull).toBe(true);
  });

  it("uses jsonb for the raw payload, keyed by fetchRunId", () => {
    const cols = getTableColumns(rawPayloads);
    expect(cols.payload.columnType).toBe("PgJsonb");
    expect(cols.fetchRunId.primary).toBe(true);
  });

  it("enforces the composite unique on homework(childId, hwDate, subject)", () => {
    const uniques = getTableConfig(homework).uniqueConstraints;
    const cols = uniques.flatMap((u) => u.columns.map((c) => c.name));
    expect(cols).toEqual(expect.arrayContaining(["childId", "hwDate", "subject"]));
  });

  it("enforces the composite unique on classes(childId, teClassId)", () => {
    const uniques = getTableConfig(classes).uniqueConstraints;
    const cols = uniques.flatMap((u) => u.columns.map((c) => c.name));
    expect(cols).toEqual(expect.arrayContaining(["childId", "teClassId"]));
  });

  it("models score_numeric as double precision and bool flags as boolean", () => {
    expect(getTableColumns(grades).needsAttention.columnType).toBe("PgBoolean");
    expect(getTableColumns(assignments).scoreNumeric.columnType).toBe("PgDoublePrecision");
    expect(getTableColumns(standards).scoreNumeric.columnType).toBe("PgDoublePrecision");
  });
});
