import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractClassesJson, parseClassDetails, parseGradesOverview } from "./parser.js";

// Real portal HTML is gitignored (apps/api/test/fixtures/teacherease/*.html).
// Inline tests below always run; the fixture-backed `describe` blocks skip
// gracefully when the HTML isn't present (mirrors the source app's policy).
const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../test/fixtures/teacherease",
);
const GRADES_FIXTURE = join(FIXTURE_DIR, "grades-overview-sample.html");
const CLASS_FIXTURE = join(FIXTURE_DIR, "class-details-sample.html");
const hasGrades = existsSync(GRADES_FIXTURE);
const hasClass = existsSync(CLASS_FIXTURE);

describe("extractClassesJson", () => {
  it("extracts one class object from an inline kendo blob", () => {
    const html = '"data":{"Data":[{"ClassDescription":"Math","ClassID":1}],"Total"';
    const classes = extractClassesJson(html);
    expect(classes).toHaveLength(1);
  });

  it("returns [] when HTML has no kendoListView data", () => {
    expect(extractClassesJson("<html><body>nothing</body></html>")).toEqual([]);
  });

  it("returns [] on malformed JSON inside the blob", () => {
    expect(extractClassesJson('"data":{"Data":[{broken json}],"Total"')).toEqual([]);
  });
});

describe("parseGradesOverview (inline)", () => {
  it("maps status code 1→meeting, 2→needs_attention, 0→not_assessed", () => {
    const html =
      '"data":{"Data":[' +
      '{"ClassDescription":"A","GradeStatus":{"Status":1},"ClassID":1,"CurrentCGPID":11},' +
      '{"ClassDescription":"B","GradeStatus":{"Status":2},"ClassID":2,"CurrentCGPID":22},' +
      '{"ClassDescription":"C","GradeStatus":{"Status":0},"ClassID":3,"CurrentCGPID":33}' +
      '],"Total"';
    const overview = parseGradesOverview(html);
    expect(overview.classes.map((c) => c.status)).toEqual([
      "meeting",
      "needs_attention",
      "not_assessed",
    ]);
    expect(overview.summary).toMatchObject({
      totalClasses: 3,
      meetingExpectations: 1,
      needsAttention: 1,
      notAssessed: 1,
    });
  });

  it("falls back to 'Unknown' instructor when missing", () => {
    const html = '"data":{"Data":[{"ClassDescription":"X","GradeStatus":{"Status":0}}],"Total"';
    expect(parseGradesOverview(html).classes[0]?.instructor).toBe("Unknown");
  });

  it("returns an empty zero-count overview on empty HTML", () => {
    const empty = parseGradesOverview("<html></html>");
    expect(empty.classes).toEqual([]);
    expect(empty.summary.totalClasses).toBe(0);
  });
});

describe("parseClassDetails (inline)", () => {
  it("returns empty ClassDetails on HTML with no standards", () => {
    const result = parseClassDetails("<html></html>", "Empty");
    expect(result.standards).toEqual([]);
    expect(result.summary.missingAssignments).toBe(0);
  });
});

describe.skipIf(!hasGrades)("parseGradesOverview (real fixture)", () => {
  const html = readFileSync(GRADES_FIXTURE, "utf8");
  const overview = parseGradesOverview(html);

  it("extracts a non-trivial set of classes", () => {
    expect(overview.classes.length).toBeGreaterThan(0);
    expect(overview.summary.totalClasses).toBe(overview.classes.length);
  });

  it("gives every class a positive classId and cgpId", () => {
    for (const cls of overview.classes) {
      expect(cls.classId).toBeGreaterThan(0);
      expect(cls.cgpId).toBeGreaterThan(0);
    }
  });
});

describe.skipIf(!hasClass)("parseClassDetails (real fixture)", () => {
  const html = readFileSync(CLASS_FIXTURE, "utf8");
  const result = parseClassDetails(html, "Sample Class");

  it("extracts at least one standard", () => {
    expect(result.standards.length).toBeGreaterThan(0);
  });

  it("parses scores in N.NN=L format on the first scored standard", () => {
    const scored = result.standards.find((s) => s.score.includes("="));
    if (scored) {
      expect(scored.score).toMatch(/^\d+(\.\d+)?=[A-Z]$/);
      expect(scored.scoreNumeric).toBeGreaterThan(0);
    }
  });
});
