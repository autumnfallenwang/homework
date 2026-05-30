import { describe, expect, it } from "vitest";
import { DEFAULT_HOMEWORK_SUBJECTS, parseHomework } from "./homework-parser.js";

// Ported verbatim from the desktop app — all inline HTML, no fixtures.
function wrap(inner: string): string {
  return `<html><body><div class="hJDwNd-AhqUyc-uQSCkd">${inner}</div></body></html>`;
}

describe("parseHomework", () => {
  it("returns [] when main content div is missing", () => {
    expect(parseHomework("<html><body><p>nope</p></body></html>")).toEqual([]);
  });

  it("returns [] when the content div is empty", () => {
    expect(parseHomework(wrap(""))).toEqual([]);
  });

  it("parses a single entry with all four default subjects", () => {
    const html = wrap(
      "Homework for 4/14/26" +
        "Science:NoneDue: Wednesday 4/15" +
        "World Geography:Complete the Political Map of Southwest Asia & Northern Africa Due: Wednesday 4/15" +
        "English Finish reading Ch.1 of The Giver and finish up to pg. 3 of the packet Due: Wednesday 4/15" +
        "Math:Packet #2 (due Wed) Due: Wednesday 4/15",
    );
    const result = parseHomework(html);
    expect(result).toHaveLength(1);
    const entry = result[0];
    expect(entry?.date).toBe("4/14/26");
    expect(entry?.subjects).toHaveLength(4);
    expect(entry?.subjects[0]).toEqual({
      name: "Science",
      content: "None",
      dueDate: "Wednesday 4/15",
    });
    expect(entry?.subjects[1]).toEqual({
      name: "World Geography",
      content: "Complete the Political Map of Southwest Asia & Northern Africa",
      dueDate: "Wednesday 4/15",
    });
    expect(entry?.subjects[2]?.name).toBe("English");
    expect(entry?.subjects[2]?.content).toBe(
      "Finish reading Ch.1 of The Giver and finish up to pg. 3 of the packet",
    );
    expect(entry?.subjects[3]).toEqual({
      name: "Math",
      content: "Packet #2 (due Wed)",
      dueDate: "Wednesday 4/15",
    });
  });

  it("handles space-only separator between subject name and content", () => {
    const html = wrap(
      "Homework for 4/14/26English Finish Ch.1 Due: Wednesday 4/15Math:FoobarDue: Wednesday 4/15",
    );
    const result = parseHomework(html);
    expect(result[0]?.subjects[0]).toMatchObject({ name: "English", content: "Finish Ch.1" });
  });

  it("handles an empty-content subject (only 'Due:')", () => {
    const html = wrap(
      "Homework for 4/02/26Science:NoneDue: Friday 4/03" +
        "World Geography:Due: Friday 4/03" +
        "English Happylife Advertisement due on Friday Due: Friday 4/03" +
        "Math:Probability #1 Packet due FridayDue: Friday 4/03",
    );
    const result = parseHomework(html);
    expect(result[0]?.subjects[1]).toEqual({
      name: "World Geography",
      content: "",
      dueDate: "Friday 4/03",
    });
  });

  it("does not split on lowercase 'due' inside content", () => {
    const html = wrap(
      "Homework for 3/27/26Math:Packet due Friday. Review for next week's mid-year test (4/1)Due: Friday 3/27",
    );
    const result = parseHomework(html);
    expect(result[0]?.subjects[0]).toEqual({
      name: "Math",
      content: "Packet due Friday. Review for next week's mid-year test (4/1)",
      dueDate: "Friday 3/27",
    });
  });

  it("tolerates double spaces after 'Due:'", () => {
    const html = wrap("Homework for 3/23/26Science:NoneDue:  Tuesday 3/24");
    expect(parseHomework(html)[0]?.subjects[0]?.dueDate).toBe("Tuesday 3/24");
  });

  it("handles 'No Homework!' entries with no known subjects", () => {
    const html = wrap("Homework for 2/13/26No Homework! Have a great break! :)");
    const result = parseHomework(html);
    expect(result).toHaveLength(1);
    expect(result[0]?.date).toBe("2/13/26");
    expect(result[0]?.subjects).toEqual([]);
  });

  it("parses multiple entries in the order they appear", () => {
    const html = wrap(
      "Homework for 4/14/26Science:NoneDue: Wednesday 4/15" +
        "Homework for 4/13/26Math:HH5Due: Tuesday 4/14",
    );
    const result = parseHomework(html);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.date)).toEqual(["4/14/26", "4/13/26"]);
    expect(result[0]?.subjects[0]?.name).toBe("Science");
    expect(result[1]?.subjects[0]?.name).toBe("Math");
  });

  it("does not leak the next entry's anchor into this entry's body", () => {
    const html = wrap(
      "Homework for 4/14/26Science:NoneDue: Wednesday 4/15" +
        "Homework for 4/13/26Science:Bird Beak BuffetDue: Tuesday 4/14",
    );
    const result = parseHomework(html);
    expect(result[0]?.subjects[0]?.content).toBe("None");
  });

  it("honors a custom subjects option", () => {
    const html = wrap(
      "Homework for 5/01/26Biology:Cell diagramsDue: Friday 5/02Algebra:Chapter 7Due: Friday 5/02",
    );
    const result = parseHomework(html, { subjects: ["Biology", "Algebra"] });
    expect(result[0]?.subjects.map((s) => s.name)).toEqual(["Biology", "Algebra"]);
    expect(parseHomework(html)[0]?.subjects).toEqual([]);
  });

  it("ignores subjects not in the subjects list", () => {
    const html = wrap("Homework for 4/14/26Gym:Run a mileDue: Wednesday 4/15");
    expect(parseHomework(html)[0]?.subjects).toEqual([]);
  });

  it("exposes the expected default subject list", () => {
    expect(DEFAULT_HOMEWORK_SUBJECTS).toEqual(["Science", "World Geography", "English", "Math"]);
  });
});
