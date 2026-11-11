// Grade text is short Markdown with LaTeX math between $…$ (prompt v3, ADR 0016).
// The parent's item page renders it with KaTeX; emails can't, so `mathToText`
// turns it into readable Unicode: \frac{35}{12} → 35/12, x^2 → x², \le → ≤.

const SYMBOLS: Record<string, string> = {
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  ne: "≠",
  neq: "≠",
  approx: "≈",
  cdot: "·",
  times: "×",
  div: "÷",
  pm: "±",
  mp: "∓",
  to: "→",
  rightarrow: "→",
  Rightarrow: "⇒",
  implies: "⇒",
  leftarrow: "←",
  Leftarrow: "⇐",
  iff: "⇔",
  Leftrightarrow: "⇔",
  in: "∈",
  notin: "∉",
  cup: "∪",
  cap: "∩",
  infty: "∞",
  pi: "π",
  theta: "θ",
  alpha: "α",
  beta: "β",
  Delta: "Δ",
  degree: "°",
  circ: "°",
  angle: "∠",
  triangle: "△",
  perp: "⊥",
  parallel: "∥",
  sim: "~",
  cong: "≅",
  ldots: "…",
  dots: "…",
  cdots: "⋯",
  quad: " ",
  qquad: " ",
  lt: "<",
  gt: ">",
};

const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  "−": "⁻",
  n: "ⁿ",
  x: "ˣ",
};

/** The content of a {…} group starting at `open` (the "{"), and the index after it. */
function group(s: string, open: number): { body: string; end: number } | null {
  if (s[open] !== "{") return null;
  let depth = 0;
  for (let i = open; i < s.length; i += 1) {
    if (s[i] === "{") depth += 1;
    else if (s[i] === "}") {
      depth -= 1;
      if (depth === 0) return { body: s.slice(open + 1, i), end: i + 1 };
    }
  }
  return null;
}

/** A sub-expression needs brackets when it isn't a single number or name. */
function wrap(x: string): string {
  return /^[\w.]+$/u.test(x) ? x : `(${x})`;
}

function superscript(x: string): string {
  const chars = [...x];
  if (chars.length > 0 && chars.every((c) => SUPERSCRIPT[c])) {
    return chars.map((c) => SUPERSCRIPT[c]).join("");
  }
  return chars.length === 1 ? `^${x}` : `^(${x})`;
}

/** Relations and arrows read best with a space either side. */
const SPACED = new Set([
  "le",
  "leq",
  "ge",
  "geq",
  "ne",
  "neq",
  "approx",
  "to",
  "rightarrow",
  "Rightarrow",
  "implies",
  "leftarrow",
  "Leftarrow",
  "iff",
  "Leftrightarrow",
  "in",
  "notin",
  "sim",
  "cong",
  "lt",
  "gt",
]);

/** One LaTeX formula (no $) as plain Unicode text. */
export function latexToText(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;
    if (c === "\\") {
      const m = /^\\([A-Za-z]+ ?|.)/.exec(src.slice(i));
      // A command swallows one following space, as in LaTeX ("\\cdot 3").
      const name = (m?.[1] ?? "").trimEnd();
      i += m?.[0].length ?? 1;
      if (name === "frac" || name === "dfrac" || name === "tfrac") {
        const a = group(src, i);
        const b = a ? group(src, a.end) : null;
        if (a && b) {
          out += `${wrap(latexToText(a.body))}/${wrap(latexToText(b.body))}`;
          i = b.end;
        }
        continue;
      }
      if (name === "sqrt") {
        const a = group(src, i);
        if (a) {
          const inner = latexToText(a.body);
          out += `√${/^[\w.]+$/u.test(inner) ? inner : `(${inner})`}`;
          i = a.end;
        } else out += "√";
        continue;
      }
      if (name === "text" || name === "mathrm" || name === "textbf" || name === "mathbf") {
        const a = group(src, i);
        if (a) {
          out += a.body;
          i = a.end;
        }
        continue;
      }
      if (name === "left" || name === "right" || name === "," || name === ";" || name === "!") {
        if (name === "," || name === ";") out += " ";
        continue;
      }
      if (name === "{" || name === "}" || name === "%" || name === "$" || name === "&") {
        out += name;
        continue;
      }
      const symbol = SYMBOLS[name] ?? name;
      out += SPACED.has(name) ? ` ${symbol} ` : symbol;
      continue;
    }
    if (c === "^") {
      const g = group(src, i + 1);
      if (g) {
        out += superscript(latexToText(g.body));
        i = g.end;
      } else {
        out += superscript(src[i + 1] ?? "");
        i += 2;
      }
      continue;
    }
    if (c === "_") {
      const g = group(src, i + 1);
      if (g) {
        out += latexToText(g.body);
        i = g.end;
      } else {
        out += src[i + 1] ?? "";
        i += 2;
      }
      continue;
    }
    if (c === "{" || c === "}") {
      i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Grade text (Markdown + $math$) as plain text for emails: formulas to Unicode,
 * **bold** / *italic* / `code` markers dropped. Text without any of it — older
 * grades — comes back unchanged.
 */
export function mathToText(md: string): string {
  return md
    .replace(/\$\$([^$]+)\$\$/g, (_, f: string) => latexToText(f))
    .replace(/\$([^$\n]+)\$/g, (_, f: string) => latexToText(f))
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1");
}
