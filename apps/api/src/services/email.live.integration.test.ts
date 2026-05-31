// Opt-in live SMTP send. Skips unless EMAIL_LIVE=1; reads SMTP_* from the env
// (apps/api/.env via vitest.config). Uses the REAL nodemailer (no mock here) to
// exercise the production sendEmail path. Mirrors the desktop EMAIL_LIVE pattern.
//
// Run: EMAIL_LIVE=1 pnpm --filter @homework/api exec vitest run email.live

import { describe, expect, it } from "vitest";
import { type SmtpConfig, sendEmail } from "./email.js";

const live = process.env.EMAIL_LIVE === "1";

describe.skipIf(!live)("live SMTP send (real server)", () => {
  it("sends a multipart email", async () => {
    const cfg: SmtpConfig = {
      host: process.env.SMTP_HOST ?? "",
      port: Number.parseInt(process.env.SMTP_PORT ?? "0", 10),
      username: process.env.SMTP_USERNAME ?? "",
      password: process.env.SMTP_PASSWORD ?? "",
      from: process.env.SMTP_FROM ?? "",
      to: process.env.SMTP_TO ?? "",
    };
    await sendEmail(cfg, {
      subject: "TeacherEase Parent Companion: M05 live smoke test",
      text: "M05 live-send smoke test (plaintext). If you see this, nodemailer SMTP works.",
      html: "<p>M05 live-send smoke test (HTML). If you see this, nodemailer SMTP works with multipart.</p>",
    });
    expect(true).toBe(true);
  });
});
