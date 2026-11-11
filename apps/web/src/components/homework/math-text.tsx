"use client";

// Grade text as the parent reads it (ADR 0016): from prompt v3 the model writes
// short Markdown with $LaTeX$ math, rendered here with KaTeX — stacked fractions,
// real exponents, ≤ and ⇒. Older grades are plain text and stay plain (Markdown
// would turn a stray * into italics).
//
// Model output is untrusted: no raw HTML (skipHtml), no links, images, headings,
// lists, tables or code blocks (unwrapped to their text), KaTeX with trust off
// and errors shown as the formula's source instead of throwing.

import "katex/dist/katex.min.css";
import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

const DISALLOWED = [
  "a",
  "img",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "pre",
  "blockquote",
  "hr",
  "input",
];

const katexOptions = { throwOnError: false, strict: false, trust: false } as const;

/** Paragraphs as inline spans, for text inside a sentence or a list row. */
const inlineComponents: ComponentProps<typeof ReactMarkdown>["components"] = {
  p: ({ children }) => <span>{children}</span>,
};

export function MathText({
  text,
  rich,
  inline = false,
}: {
  text: string;
  /** Markdown + $LaTeX$ (prompt v3 on); plain text otherwise. */
  rich: boolean;
  inline?: boolean;
}) {
  if (!rich) return <>{text}</>;
  return (
    <ReactMarkdown
      remarkPlugins={[[remarkMath, { singleDollarTextMath: true }]]}
      rehypePlugins={[[rehypeKatex, katexOptions]]}
      disallowedElements={DISALLOWED}
      unwrapDisallowed
      skipHtml
      components={inline ? inlineComponents : undefined}
    >
      {text}
    </ReactMarkdown>
  );
}
