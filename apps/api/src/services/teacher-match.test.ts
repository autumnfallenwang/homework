import { describe, expect, it } from "vitest";
import {
  buildMatchMessages,
  candidatesFrom,
  candidatesHash,
  readMatchAnswer,
  type TeacherRow,
} from "./teacher-match.js";

const row = (id: number, className: string, name: string, due: string): TeacherRow => ({
  teAssignmentId: id,
  className,
  assignmentName: name,
  dueDate: due,
  score: "3=M",
  scoreLetter: "M",
  isMissing: false,
});

const rows: TeacherRow[] = [
  row(1, "English 8", "#033 Stay & Stray Theme Reflection", "11/2"),
  row(2, "English 8", "#034 Lit. Circle Book Check-in", "11/2"),
  row(3, "English 8", "#026 Discussion Reflection", "10/15"),
  row(4, "French 8", "Paris monuments", "10/30"),
  row(5, "English 8", "Ten days later", "11/12"),
  row(7, "English 8", "Way later", "11/13"),
  row(6, "english 8", "Case differs", "10/31"),
];

describe("candidatesFrom", () => {
  it("keeps the same class (any case) due within 10 days of hers", () => {
    const cands = candidatesFrom(rows, { className: "English 8", dueOn: "2026-11-02" });
    expect(cands.map((c) => c.teAssignmentId)).toEqual([6, 1, 2, 5]);
    expect(cands[1]?.dueIso).toBe("2026-11-02");
  });
  it("has none for Other", () => {
    expect(candidatesFrom(rows, { className: null, dueOn: "2026-11-02" })).toEqual([]);
  });
  it("hashes the set, not its order", () => {
    const a = candidatesFrom(rows, { className: "English 8", dueOn: "2026-11-02" });
    expect(candidatesHash(a)).toBe(candidatesHash([...a].reverse()));
    expect(candidatesHash(a)).not.toBe(candidatesHash(a.slice(1)));
  });
});

describe("the match model's answer", () => {
  const cands = candidatesFrom(rows, { className: "English 8", dueOn: "2026-11-02" });

  it("lists the candidates and what her photos showed", () => {
    const [, user] = buildMatchMessages(
      {
        className: "English 8",
        kind: "homework",
        title: "fill out reflection",
        details: null,
        assignedOn: "2026-10-30",
        dueOn: "2026-11-02",
        note: "hard to explain the theme",
        sheetTitle: "Stay & Stray Theme Reflection",
        gradeSummary: null,
      },
      cands,
    );
    const text = typeof user?.content === "string" ? user.content : "";
    expect(text).toContain('- id 1: "#033 Stay & Stray Theme Reflection" (due 2026-11-02)');
    expect(text).toContain("Title printed on her sheet (read from her photos): Stay & Stray");
  });

  it("keeps only listed assignments, once each at its best confidence", () => {
    const picks = readMatchAnswer(
      {
        model: "m",
        content: null,
        usage: null,
        toolCalls: [
          {
            name: "record_matches",
            arguments: JSON.stringify({
              matches: [
                { assignment_id: 1, confidence: "high", reason: "theme reflection" },
                { assignment_id: "2", confidence: "low", reason: "" },
                { assignment_id: 99, confidence: "high", reason: "not listed" },
                { assignment_id: 1, confidence: "medium", reason: "again" },
              ],
            }),
          },
        ],
      },
      cands,
    );
    expect(picks).toEqual([
      { teAssignmentId: 1, confidence: "high", reason: "theme reflection" },
      { teAssignmentId: 2, confidence: "low", reason: null },
    ]);
  });
});
