// The grade alert email (ADR 0014): sent to the parent right after a grade below
// the alert score. A retake request alone sends none — the child sees it in the
// app, the parent in the daily digest; one that comes with a low score is
// mentioned here. Same SMTP sender and look as the daily digest.

import { type GradeFinding, gradeQuestionLabel, mathToText } from "@homework/shared";
import { escapeHtml } from "../lib/html.js";
import type { EmailContent } from "./email.js";

export interface GradeAlertInput {
  childName: string;
  className: string;
  title: string;
  dueOn: string;
  status: "graded" | "retake" | "not_gradable";
  score: number | null;
  summary: string | null;
  findings: GradeFinding[];
  stuck: boolean;
  retakeReason: string | null;
  alertBelow: number;
  /** The parent's item page. */
  url: string;
}

/** "58/100, needs you" — the alert goes out for low scores only (founder, 2026-11-11). */
export function gradeAlertHeadline(a: GradeAlertInput): string {
  return a.score !== null ? `${a.score}/100, needs you` : "needs you";
}

/** Email clients can't render $LaTeX$ (ADR 0016): every text field goes out as readable Unicode. */
export function renderGradeAlert(input: GradeAlertInput): EmailContent {
  const a: GradeAlertInput = {
    ...input,
    summary: input.summary === null ? null : mathToText(input.summary),
    findings: input.findings.map((f) => ({
      ...f,
      question: f.question === null ? null : mathToText(f.question),
      problem: mathToText(f.problem),
      fix: f.fix === null ? null : mathToText(f.fix),
    })),
  };
  return renderAlert(a);
}

function renderAlert(a: GradeAlertInput): EmailContent {
  const headline = gradeAlertHeadline(a);
  const subject = `${a.childName} · ${a.className} · ${a.title} — ${headline}`;

  const text: string[] = [
    `${a.childName} · ${a.className} · ${a.title} (due ${a.dueOn})`,
    headline,
    "",
  ];
  if (a.summary) text.push(a.summary, "");
  if (a.stuck) text.push("She says she got stuck on part of it.", "");
  if (a.findings.length > 0) {
    text.push("What to look at:");
    for (const f of a.findings) {
      const where = [f.photoLabel, f.question ? gradeQuestionLabel(f.question) : null]
        .filter(Boolean)
        .join(", ");
      text.push(`  - ${where ? `${where}: ` : ""}${f.problem}${f.fix ? ` → ${f.fix}` : ""}`);
    }
    text.push("");
  }
  if (a.retakeReason) text.push(`Retake request (she sees this too): ${a.retakeReason}`, "");
  text.push(`Open it: ${a.url}`, "", "Graded by a model — check before acting on it.");

  const li = a.findings
    .map((f) => {
      const where = [f.photoLabel, f.question ? gradeQuestionLabel(f.question) : null]
        .filter(Boolean)
        .join(", ");
      return `<li style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#111827;">${where ? `<strong>${escapeHtml(where)}:</strong> ` : ""}${escapeHtml(f.problem)}${f.fix ? `<br><span style="color:#047857;">→ ${escapeHtml(f.fix)}</span>` : ""}</li>`;
    })
    .join("\n        ");
  const scoreColor =
    a.status === "graded" && a.score !== null && a.score < a.alertBelow ? "#b91c1c" : "#b45309";
  const html = `<!doctype html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;margin:0;padding:24px;background:#f3f4f6;color:#111827;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;">
    <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">${escapeHtml(a.childName)} · ${escapeHtml(a.className)} · due ${escapeHtml(a.dueOn)}</p>
    <h1 style="margin:0 0 12px;font-size:18px;">${escapeHtml(a.title)} — <span style="color:${scoreColor};">${escapeHtml(headline)}</span></h1>
    ${a.summary ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.5;">${escapeHtml(a.summary)}</p>` : ""}
    ${a.stuck ? `<p style="margin:0 0 12px;font-size:13px;color:#9a3412;">She says she got stuck on part of it.</p>` : ""}
    ${a.findings.length > 0 ? `<h3 style="margin:12px 0 8px;font-size:13px;color:#374151;text-transform:uppercase;letter-spacing:0.04em;">What to look at</h3>\n      <ul style="margin:0 0 12px;padding-left:18px;">\n        ${li}\n      </ul>` : ""}
    ${a.retakeReason ? `<div style="padding:10px 12px;border-radius:6px;background:#fffbeb;margin:0 0 12px;font-size:13px;"><strong>Retake request</strong> (she sees this too): ${escapeHtml(a.retakeReason)}</div>` : ""}
    <p style="margin:16px 0 0;"><a href="${escapeHtml(a.url)}" style="color:#1d4ed8;">Open the homework</a></p>
    <p style="margin:16px 0 0;color:#9ca3af;font-size:11px;">Graded by a model — check before acting on it.</p>
  </div>
</body>
</html>`;
  return { subject, text: text.join("\n"), html };
}
