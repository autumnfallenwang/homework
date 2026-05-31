import { describe, expect, it } from "vitest";
import {
  type AttentionItem,
  classifyAssignment,
  computeChildAttention,
  computeClassAttention,
  DEFAULT_ATTENTION_CONFIG,
  DEFAULT_FORGIVENESS_WEEKS,
  DEFAULT_LOW_SCORE_THRESHOLD,
  parseAttentionConfig,
  sortItemsMissingFirst,
} from "./attention-engine.js";
import type { Assignment, ClassDetails, Standard } from "./domain.js";

// All tests pin `now` to a fixed date so age-math is deterministic.
const NOW = new Date(2026, 3, 16); // April 16, 2026

let asnIdCounter = 1;
function asn(name: string, opts: Partial<Assignment> = {}): Assignment {
  return {
    // Real TeacherEase data never reuses a TestNameID within a class.
    // Auto-increment here so the engine's dedup-by-(class, testNameId)
    // doesn't collapse unrelated test fixtures together.
    testNameId: asnIdCounter++,
    dueDate: "",
    name,
    weight: "",
    grade: "",
    gradeNumeric: 0,
    gradeLetter: "",
    isMissing: false,
    feedback: "",
    ...opts,
  };
}

function std(
  name: string,
  opts: {
    assignments?: Assignment[];
    children?: Standard[];
    score?: string;
    scoreNumeric?: number;
    scoreLetter?: string;
    isMeeting?: boolean;
  } = {},
): Standard {
  const assignments = opts.assignments ?? [];
  return {
    name,
    score: opts.score ?? "",
    scoreNumeric: opts.scoreNumeric ?? 0,
    scoreLetter: opts.scoreLetter ?? "",
    isMeeting: opts.isMeeting ?? true,
    children: opts.children ?? [],
    assignments,
    missingCount: assignments.filter((a) => a.isMissing).length,
    lowScoreCount: 0,
  };
}

function cd(className: string, standards: Standard[]): ClassDetails {
  return {
    className,
    standards,
    summary: { missingAssignments: 0 },
  };
}

// ---------------------------------------------------------------------------
// classifyAssignment
// ---------------------------------------------------------------------------

describe("classifyAssignment", () => {
  it("flags a missing assignment that's within the forgiveness window", () => {
    const a = asn("Homework 1", { isMissing: true, dueDate: "4/13" }); // 3 days ago
    const r = classifyAssignment(a, NOW, DEFAULT_ATTENTION_CONFIG);
    expect(r.reason).toBe("missing");
    expect(r.withinWindow).toBe(true);
    expect(r.ageDays).toBe(3);
  });

  it("flags an aged-out missing as missing but not within-window", () => {
    const a = asn("Old missing", { isMissing: true, dueDate: "3/17" }); // ~30 days ago
    const r = classifyAssignment(a, NOW, DEFAULT_ATTENTION_CONFIG);
    expect(r.reason).toBe("missing");
    expect(r.withinWindow).toBe(false);
    expect(r.ageDays).toBeGreaterThan(14);
  });

  it("flags a low-score assignment (score strictly below threshold)", () => {
    const a = asn("Quiz", { gradeNumeric: 2.5, dueDate: "4/14" });
    const r = classifyAssignment(a, NOW, DEFAULT_ATTENTION_CONFIG);
    expect(r.reason).toBe("lowScore");
    expect(r.withinWindow).toBe(true);
  });

  it("does NOT flag score exactly at threshold (3.0 = TeacherEase Meeting)", () => {
    const a = asn("Meets", { gradeNumeric: 3.0, dueDate: "4/14" });
    const r = classifyAssignment(a, NOW, DEFAULT_ATTENTION_CONFIG);
    expect(r.reason).toBeNull();
  });

  it("does NOT flag score above threshold", () => {
    const a = asn("Exceeds", { gradeNumeric: 3.5, dueDate: "4/14" });
    const r = classifyAssignment(a, NOW, DEFAULT_ATTENTION_CONFIG);
    expect(r.reason).toBeNull();
  });

  it("does NOT flag an ungraded assignment (gradeNumeric == 0, not missing)", () => {
    const a = asn("Not yet graded", { gradeNumeric: 0, dueDate: "4/10" });
    const r = classifyAssignment(a, NOW, DEFAULT_ATTENTION_CONFIG);
    expect(r.reason).toBeNull();
  });

  it("treats null/empty dueDate as within-window with ageDays=null", () => {
    const a = asn("No date missing", { isMissing: true, dueDate: "" });
    const r = classifyAssignment(a, NOW, DEFAULT_ATTENTION_CONFIG);
    expect(r.reason).toBe("missing");
    expect(r.ageDays).toBeNull();
    expect(r.withinWindow).toBe(true);
  });

  it("gives future-dated assignments negative ageDays and within-window", () => {
    const a = asn("Future quiz", { isMissing: true, dueDate: "4/21" }); // 5 days ahead
    const r = classifyAssignment(a, NOW, DEFAULT_ATTENTION_CONFIG);
    expect(r.ageDays).toBe(-5);
    expect(r.withinWindow).toBe(true);
    expect(r.reason).toBe("missing");
  });
});

// ---------------------------------------------------------------------------
// computeClassAttention — propagation
// ---------------------------------------------------------------------------

describe("computeClassAttention — propagation", () => {
  it("marks a leaf standard with a fresh missing as attention", () => {
    const detail = cd("Math", [
      std("Addition", { assignments: [asn("HW1", { isMissing: true, dueDate: "4/13" })] }),
    ]);
    const r = computeClassAttention(detail, NOW);
    expect(r.standards[0]?.flag).toEqual({ status: "attention", agedOutOnly: false });
    expect(r.classFlag).toEqual({ status: "attention", agedOutOnly: false });
  });

  it("marks a leaf with only aged-out missing as clean+agedOutOnly", () => {
    const detail = cd("Math", [
      std("Addition", { assignments: [asn("Old HW", { isMissing: true, dueDate: "3/17" })] }),
    ]);
    const r = computeClassAttention(detail, NOW);
    expect(r.standards[0]?.flag).toEqual({ status: "clean", agedOutOnly: true });
    expect(r.classFlag).toEqual({ status: "clean", agedOutOnly: true });
  });

  it("marks a leaf with all clean assignments as fully clean", () => {
    const detail = cd("Math", [
      std("Addition", { assignments: [asn("HW1", { gradeNumeric: 3.0 })] }),
    ]);
    const r = computeClassAttention(detail, NOW);
    expect(r.standards[0]?.flag).toEqual({ status: "clean", agedOutOnly: false });
    expect(r.classFlag).toEqual({ status: "clean", agedOutOnly: false });
  });

  it("propagates attention from a dirty child through the parent to the class", () => {
    const dirtyChild = std("Dirty child", {
      assignments: [asn("Missing", { isMissing: true, dueDate: "4/14" })],
    });
    const cleanChild = std("Clean child", {
      assignments: [asn("OK", { gradeNumeric: 3.0 })],
    });
    const detail = cd("Social Studies", [std("Parent", { children: [dirtyChild, cleanChild] })]);
    const r = computeClassAttention(detail, NOW);
    expect(r.standards[0]?.flag.status).toBe("attention");
    expect(r.classFlag.status).toBe("attention");
  });

  it("keeps a parent clean when all children and own assignments are clean", () => {
    const detail = cd("English", [
      std("Parent", {
        assignments: [asn("OK", { gradeNumeric: 3.0 })],
        children: [std("Leaf", { assignments: [asn("OK2", { gradeNumeric: 3.0 })] })],
      }),
    ]);
    const r = computeClassAttention(detail, NOW);
    expect(r.standards[0]?.flag).toEqual({ status: "clean", agedOutOnly: false });
    expect(r.classFlag).toEqual({ status: "clean", agedOutOnly: false });
  });

  it("rolls up own-assignment attention at the same level as children", () => {
    const detail = cd("Science", [
      std("Parent", {
        assignments: [asn("Direct low", { gradeNumeric: 1.5, dueDate: "4/14" })],
        children: [std("Leaf", { assignments: [asn("Child clean", { gradeNumeric: 3.0 })] })],
      }),
    ]);
    const r = computeClassAttention(detail, NOW);
    expect(r.standards[0]?.flag.status).toBe("attention");
  });

  it("propagates through 3 levels of nesting", () => {
    const leaf = std("Leaf", {
      assignments: [asn("Bad", { gradeNumeric: 1.0, dueDate: "4/14" })],
    });
    const mid = std("Mid", { children: [leaf] });
    const top = std("Top", { children: [mid] });
    const detail = cd("History", [top]);
    const r = computeClassAttention(detail, NOW);
    expect(r.standards[0]?.flag.status).toBe("attention"); // top
    expect(r.standards[0]?.children[0]?.flag.status).toBe("attention"); // mid
    expect(r.standards[0]?.children[0]?.children[0]?.flag.status).toBe("attention"); // leaf
    expect(r.classFlag.status).toBe("attention");
  });

  it("collects attention items across the whole tree (fresh + aged-out)", () => {
    const detail = cd("Math", [
      std("A", { assignments: [asn("Fresh missing", { isMissing: true, dueDate: "4/14" })] }),
      std("B", {
        children: [
          std("B-Leaf", {
            assignments: [asn("Aged missing", { isMissing: true, dueDate: "3/10" })],
          }),
        ],
      }),
    ]);
    const r = computeClassAttention(detail, NOW);
    expect(r.items).toHaveLength(2);
    expect(r.items.map((i) => i.assignment.name).sort()).toEqual(
      ["Aged missing", "Fresh missing"].sort(),
    );
  });

  it("excludes clean assignments from the items list", () => {
    const detail = cd("Math", [
      std("A", {
        assignments: [
          asn("Good1", { gradeNumeric: 3.0 }),
          asn("Bad", { gradeNumeric: 1.0, dueDate: "4/14" }),
          asn("Good2", { gradeNumeric: 3.5 }),
        ],
      }),
    ]);
    const r = computeClassAttention(detail, NOW);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]?.assignment.name).toBe("Bad");
  });

  it("attaches className to every emitted item", () => {
    const detail = cd("Physical Education", [
      std("Fitness", { assignments: [asn("Missing log", { isMissing: true, dueDate: "4/14" })] }),
    ]);
    const r = computeClassAttention(detail, NOW);
    expect(r.items[0]?.className).toBe("Physical Education");
  });
});

// ---------------------------------------------------------------------------
// computeChildAttention — aggregation
// ---------------------------------------------------------------------------

describe("computeChildAttention — aggregation", () => {
  it("aggregates attention across classes and splits items by window", () => {
    const math = cd("Math", [
      std("A", { assignments: [asn("Fresh", { isMissing: true, dueDate: "4/14" })] }),
    ]);
    const english = cd("English", [
      std("B", { assignments: [asn("Aged", { isMissing: true, dueDate: "3/10" })] }),
    ]);
    const science = cd("Science", [std("C", { assignments: [asn("OK", { gradeNumeric: 3.0 })] })]);

    const r = computeChildAttention([math, english, science], NOW);
    expect(r.childFlag.status).toBe("attention"); // fresh missing triggers
    expect(r.withinWindow).toHaveLength(1);
    expect(r.agedOut).toHaveLength(1);
    expect(r.perClass).toHaveLength(3);
  });

  it("returns a clean child when every class is clean", () => {
    const classes = ["A", "B", "C"].map((n) =>
      cd(n, [std("s", { assignments: [asn("ok", { gradeNumeric: 3.0 })] })]),
    );
    const r = computeChildAttention(classes, NOW);
    expect(r.childFlag).toEqual({ status: "clean", agedOutOnly: false });
    expect(r.withinWindow).toHaveLength(0);
    expect(r.agedOut).toHaveLength(0);
  });

  it("marks child clean+agedOutOnly when every class has only aged-out items", () => {
    const classes = ["A", "B"].map((n) =>
      cd(n, [std("s", { assignments: [asn("old", { isMissing: true, dueDate: "3/10" })] })]),
    );
    const r = computeChildAttention(classes, NOW);
    expect(r.childFlag).toEqual({ status: "clean", agedOutOnly: true });
    expect(r.withinWindow).toHaveLength(0);
    expect(r.agedOut).toHaveLength(2);
  });

  it("handles empty input", () => {
    const r = computeChildAttention([], NOW);
    expect(r.childFlag).toEqual({ status: "clean", agedOutOnly: false });
    expect(r.perClass).toHaveLength(0);
    expect(r.withinWindow).toHaveLength(0);
    expect(r.agedOut).toHaveLength(0);
  });

  it("preserves input class order in perClass", () => {
    const classes = ["Zebra", "Alpha", "Mango"].map((n) =>
      cd(n, [std("s", { assignments: [asn("ok", { gradeNumeric: 3.0 })] })]),
    );
    const r = computeChildAttention(classes, NOW);
    expect(r.perClass.map((c) => c.className)).toEqual(["Zebra", "Alpha", "Mango"]);
  });
});

// ---------------------------------------------------------------------------
// Tunable config (forgiveness window + low-score threshold)
// ---------------------------------------------------------------------------

describe("tunable config", () => {
  it("forgivenessWeeks=1: a 10-day-old missing is aged out", () => {
    const a = asn("Old", { isMissing: true, dueDate: "4/6" }); // 10 days ago
    const r = classifyAssignment(a, NOW, { forgivenessWeeks: 1, lowScoreThreshold: 3.0 });
    expect(r.withinWindow).toBe(false);
  });

  it("forgivenessWeeks=4: a 20-day-old missing is still within window", () => {
    const a = asn("Old", { isMissing: true, dueDate: "3/27" }); // 20 days ago
    const r = classifyAssignment(a, NOW, { forgivenessWeeks: 4, lowScoreThreshold: 3.0 });
    expect(r.withinWindow).toBe(true);
  });

  it("boundary: exactly forgivenessWeeks*7 days old is still within window", () => {
    // 2 weeks = 14 days; a 14-day-old item is still within at default config.
    const a = asn("Boundary", { isMissing: true, dueDate: "4/2" }); // 14 days ago
    const r = classifyAssignment(a, NOW, DEFAULT_ATTENTION_CONFIG);
    expect(r.ageDays).toBe(14);
    expect(r.withinWindow).toBe(true);
  });

  it("boundary: one day beyond forgivenessWeeks*7 is aged out", () => {
    const a = asn("Just aged", { isMissing: true, dueDate: "4/1" }); // 15 days ago
    const r = classifyAssignment(a, NOW, DEFAULT_ATTENTION_CONFIG);
    expect(r.ageDays).toBe(15);
    expect(r.withinWindow).toBe(false);
  });

  it("lowScoreThreshold=2.0: a 2.5 score no longer counts; 1.5 still does", () => {
    const cfg = { forgivenessWeeks: 2, lowScoreThreshold: 2.0 };
    const mid = classifyAssignment(asn("Mid", { gradeNumeric: 2.5, dueDate: "4/14" }), NOW, cfg);
    const low = classifyAssignment(asn("Low", { gradeNumeric: 1.5, dueDate: "4/14" }), NOW, cfg);
    expect(mid.reason).toBeNull();
    expect(low.reason).toBe("lowScore");
  });

  it("lowScoreThreshold=4.0: a 3.5 score now counts", () => {
    const cfg = { forgivenessWeeks: 2, lowScoreThreshold: 4.0 };
    const a = classifyAssignment(asn("Was ok", { gradeNumeric: 3.5, dueDate: "4/14" }), NOW, cfg);
    expect(a.reason).toBe("lowScore");
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("empty class has clean flag and no items", () => {
    const r = computeClassAttention(cd("Empty", []), NOW);
    expect(r.classFlag).toEqual({ status: "clean", agedOutOnly: false });
    expect(r.items).toHaveLength(0);
    expect(r.standards).toHaveLength(0);
  });

  it("standard with no assignments and no children is clean", () => {
    const detail = cd("Math", [std("Empty standard")]);
    const r = computeClassAttention(detail, NOW);
    expect(r.standards[0]?.flag).toEqual({ status: "clean", agedOutOnly: false });
    expect(r.classFlag).toEqual({ status: "clean", agedOutOnly: false });
  });

  it("missing-and-low-score: reason is missing (missing wins)", () => {
    const a = asn("Both", { isMissing: true, gradeNumeric: 1.0, dueDate: "4/14" });
    const r = classifyAssignment(a, NOW, DEFAULT_ATTENTION_CONFIG);
    expect(r.reason).toBe("missing");
  });

  it("exposes default constants at the expected values", () => {
    expect(DEFAULT_FORGIVENESS_WEEKS).toBe(2);
    expect(DEFAULT_LOW_SCORE_THRESHOLD).toBe(3.0);
    expect(DEFAULT_ATTENTION_CONFIG).toEqual({
      forgivenessWeeks: 2,
      lowScoreThreshold: 3.0,
    });
  });
});

// ---------------------------------------------------------------------------
// parseAttentionConfig — settings-string → config, with defaults
// ---------------------------------------------------------------------------

describe("parseAttentionConfig", () => {
  it("falls back to defaults for empty/missing strings", () => {
    expect(parseAttentionConfig("", "")).toEqual(DEFAULT_ATTENTION_CONFIG);
    expect(parseAttentionConfig(null, undefined)).toEqual(DEFAULT_ATTENTION_CONFIG);
  });

  it("passes through valid in-range values", () => {
    expect(parseAttentionConfig("3", "2.5")).toEqual({
      forgivenessWeeks: 3,
      lowScoreThreshold: 2.5,
    });
  });

  it("falls back when strings are unparseable", () => {
    expect(parseAttentionConfig("abc", "xyz")).toEqual(DEFAULT_ATTENTION_CONFIG);
  });

  it("clamps out-of-range forgivenessWeeks to the default", () => {
    // Below 1
    expect(parseAttentionConfig("0", "3.0").forgivenessWeeks).toBe(DEFAULT_FORGIVENESS_WEEKS);
    // Above 12
    expect(parseAttentionConfig("15", "3.0").forgivenessWeeks).toBe(DEFAULT_FORGIVENESS_WEEKS);
  });

  it("clamps out-of-range lowScoreThreshold to the default", () => {
    expect(parseAttentionConfig("2", "-1").lowScoreThreshold).toBe(DEFAULT_LOW_SCORE_THRESHOLD);
    expect(parseAttentionConfig("2", "10").lowScoreThreshold).toBe(DEFAULT_LOW_SCORE_THRESHOLD);
  });

  it("handles partial validity (valid weeks, invalid threshold)", () => {
    const r = parseAttentionConfig("4", "notanumber");
    expect(r.forgivenessWeeks).toBe(4);
    expect(r.lowScoreThreshold).toBe(DEFAULT_LOW_SCORE_THRESHOLD);
  });
});

// ---------------------------------------------------------------------------
// sortItemsMissingFirst
// ---------------------------------------------------------------------------

describe("sortItemsMissingFirst", () => {
  function item(reason: "missing" | "lowScore", name: string): AttentionItem {
    return {
      reason,
      className: "Math",
      assignment: asn(name),
      ageDays: 0,
      withinWindow: true,
    };
  }

  it("puts missings before lowScores and preserves order within each category", () => {
    const input = [
      item("lowScore", "l1"),
      item("missing", "m1"),
      item("lowScore", "l2"),
      item("missing", "m2"),
    ];
    const sorted = sortItemsMissingFirst(input);
    expect(sorted.map((i) => i.assignment.name)).toEqual(["m1", "m2", "l1", "l2"]);
  });

  it("returns same order when all items share the same reason", () => {
    const input = [item("lowScore", "a"), item("lowScore", "b"), item("lowScore", "c")];
    expect(sortItemsMissingFirst(input).map((i) => i.assignment.name)).toEqual(["a", "b", "c"]);
  });
});
