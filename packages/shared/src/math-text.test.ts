import { describe, expect, it } from "vitest";
import { latexToText, mathToText } from "./math-text.js";

describe("latexToText", () => {
  it("turns the real findings' math into readable text", () => {
    expect(latexToText(String.raw`\frac{15}{4}-\frac{5}{6}=\frac{35}{12}`)).toBe("15/4-5/6=35/12");
    expect(latexToText(String.raw`\frac{35}{12}x \le \frac{23}{8}`)).toBe("35/12x ≤ 23/8");
    expect(latexToText(String.raw`-2x<-98 \Rightarrow x>49`)).toBe("-2x<-98 ⇒ x>49");
    expect(latexToText(String.raw`2|5-1|+7=15`)).toBe("2|5-1|+7=15");
    expect(latexToText(String.raw`x \in \{3, \frac{1}{3}\}`)).toBe("x ∈ {3, 1/3}");
    expect(latexToText(String.raw`-2\cdot 3^3 = -54`)).toBe("-2·3³ = -54");
    expect(latexToText(String.raw`A(-1,5) \to A'(5,-1)`)).toBe("A(-1,5) → A'(5,-1)");
  });

  it("brackets compound parts and handles roots, text and subscripts", () => {
    expect(latexToText(String.raw`\frac{x+1}{2}`)).toBe("(x+1)/2");
    expect(latexToText(String.raw`\sqrt{64} + \sqrt{x+1}`)).toBe("√64 + √(x+1)");
    expect(latexToText(String.raw`x^{2y}`)).toBe("x^(2y)");
    expect(latexToText(String.raw`x_1 + x_{12}`)).toBe("x1 + x12");
    expect(latexToText(String.raw`5 \text{ km}`)).toBe("5 km");
    expect(latexToText(String.raw`\left( x \right)`)).toBe("( x )");
  });
});

describe("mathToText", () => {
  it("converts $…$ and drops Markdown markers", () => {
    expect(mathToText(String.raw`In **1c**, $-2\cdot 3^3$ should be $-54$, not *-18*.`)).toBe(
      "In 1c, -2·3³ should be -54, not -18.",
    );
    expect(mathToText("Use `x > 49` here.")).toBe("Use x > 49 here.");
  });

  it("leaves older plain text alone", () => {
    const plain = "From -2x < -98 she got x > 19.6. 73037 − 72927 = 110 km; 2*3 = 6.";
    expect(mathToText(plain)).toBe(plain);
  });
});
