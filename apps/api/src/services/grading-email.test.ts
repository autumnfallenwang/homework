import { describe, expect, it } from "vitest";
import { type GradeAlertInput, gradeAlertHeadline, renderGradeAlert } from "./grading-email.js";

const base: GradeAlertInput = {
  childName: "Ivy",
  className: "Mathematics 8 Honors",
  title: "packet <1>",
  dueOn: "2026-11-02",
  status: "graded",
  score: 58,
  summary: "Reflections packet.",
  findings: [
    {
      photoId: "p",
      photoLabel: "Solution photo 9",
      question: "15",
      problem: "Negated both",
      fix: "Swap x & y",
    },
  ],
  stuck: true,
  retakeReason: null,
  alertBelow: 80,
  url: "http://homework.arch.internal/review/homework/abc",
};

describe("grade alert email", () => {
  it("says the score", () => {
    expect(gradeAlertHeadline(base)).toBe("58/100, needs you");
    expect(gradeAlertHeadline({ ...base, retakeReason: "blurry" })).toBe("58/100, needs you");
  });

  it("renders text and escaped HTML with the findings and the link", () => {
    const mail = renderGradeAlert(base);
    expect(mail.subject).toBe("Ivy · Mathematics 8 Honors · packet <1> — 58/100, needs you");
    expect(mail.text).toContain("Solution photo 9, Q15: Negated both → Swap x & y");
    expect(mail.text).toContain("She says she got stuck");
    expect(mail.html).toContain("packet &lt;1&gt;");
    expect(mail.html).toContain("Swap x &amp; y");
    expect(mail.html).toContain('href="http://homework.arch.internal/review/homework/abc"');
  });
});
