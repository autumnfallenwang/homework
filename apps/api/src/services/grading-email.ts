// The grade alert email (ADR 0014): sent to the parent right after a grade that
// needs them — a score below the alert score, or a retake request. Same SMTP
// sender and look as the daily digest.

import type { GradeFinding } from "@homework/shared";
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

/** "packet — 58/100, needs you" / "— retake the photos" / "— 72/100, retake photos". */
export function gradeAlertHeadline(a: GradeAlertInput): string {
  const lowScore = a.status === "graded" && a.score !== null && a.score < a.alertBelow;
  if (a.status === "graded" && a.score !== null) {
    if (a.retakeReason && !lowScore) return `${a.score}/100, retake some photos`;
    if (a.retakeReason) return `${a.score}/100, needs you · retake some photos`;
    return `${a.score}/100, needs you`;
  }
  return "retake the photos";
}

export function renderGradeAlert(a: GradeAlertInput): EmailContent {
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
      const where = [f.photoLabel, f.question ? `Q${f.question}` : null].filter(Boolean).join(", ");
      text.push(`  - ${where ? `${where}: ` : ""}${f.problem}${f.fix ? ` → ${f.fix}` : ""}`);
    }
    text.push("");
  }
  if (a.retakeReason) text.push(`Retake request (she sees this too): ${a.retakeReason}`, "");
  text.push(`Open it: ${a.url}`, "", "Graded by a model — check before acting on it.");

  const li = a.findings
    .map((f) => {
      const where = [f.photoLabel, f.question ? `Q${f.question}` : null].filter(Boolean).join(", ");
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
