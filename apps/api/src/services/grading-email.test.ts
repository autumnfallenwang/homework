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

  it("turns $LaTeX$ into readable text — email clients can't render it", () => {
    const mail = renderGradeAlert({
      ...base,
      summary: String.raw`**Inequalities**: $-2x<-98 \Rightarrow x>49$ slipped.`,
      findings: [
        {
          photoId: null,
          photoLabel: null,
          question: "1c",
          problem: String.raw`$\frac{15}{4}-\frac{5}{6}$ written as $\frac{25}{12}$`,
          fix: String.raw`$\frac{35}{12}x \le \frac{23}{8}$`,
        },
      ],
    });
    expect(mail.text).toContain("Inequalities: -2x<-98 ⇒ x>49 slipped.");
    expect(mail.text).toContain("Q1c: 15/4-5/6 written as 25/12 → 35/12x ≤ 23/8");
    expect(mail.html).not.toContain("$");
  });
});
