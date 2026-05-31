// Digest routes. Mounted at /api/digest.
//   POST /digest/send — run the notify cycle now (fetch-before if configured,
//                        build + send the digest). Returns whether it sent.
//   POST /digest/test — send a fixed test email to the configured recipients,
//                        to verify SMTP without building a real digest.

import { Hono } from "hono";
import { db } from "../db/index.js";
import { loadSmtpConfig, sendEmail } from "../services/email.js";
import { runNotifyCycle } from "../services/scheduler.js";

export const digestApp = new Hono();

digestApp.post("/send", async (c) => {
  const result = await runNotifyCycle(db);
  return c.json(result);
});

digestApp.post("/test", async (c) => {
  const cfg = await loadSmtpConfig(db);
  if (!cfg) return c.json({ error: "SMTP not configured" }, 400);
  await sendEmail(cfg, {
    subject: "TeacherEase Parent Companion: test email",
    text: "This is a test email from TeacherEase Parent Companion. SMTP is working.",
    html: "<p>This is a test email from <strong>TeacherEase Parent Companion</strong>. SMTP is working.</p>",
  });
  return c.json({ ok: true });
});
