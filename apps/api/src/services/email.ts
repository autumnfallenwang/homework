// SMTP email sender. Replaces the desktop app's Rust `lettre` transport with
// nodemailer (Node-native). The TLS decision is 1:1 with the source: implicit
// TLS on port 465, STARTTLS otherwise. SMTP config is read from the settings
// table (user-configured via the Settings UI; no env/Secret fallback).

import { createTransport } from "nodemailer";
import type { Database } from "../db/index.js";
import { getSetting } from "../db/queries.js";

export interface SmtpConfig {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly from: string;
  readonly to: string;
}

export interface EmailContent {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/**
 * Load SMTP config from the settings table. Returns null if any required field
 * is missing or the port is unparseable (mirrors the desktop loadSmtpConfig).
 */
export async function loadSmtpConfig(db: Database): Promise<SmtpConfig | null> {
  const host = (await getSetting(db, "smtp.host")) ?? "";
  if (!host) return null;
  const port = Number.parseInt((await getSetting(db, "smtp.port")) ?? "", 10);
  if (!Number.isFinite(port) || port <= 0) return null;
  const username = (await getSetting(db, "smtp.username")) ?? "";
  const from = (await getSetting(db, "smtp.from")) ?? "";
  const to = (await getSetting(db, "smtp.to")) ?? "";
  if (!username || !from || !to) return null;
  const password = (await getSetting(db, "smtp.password")) ?? "";
  if (!password) return null;
  return { host, port, username, password, from, to };
}

/** Split the comma-separated `smtp.to` into trimmed, non-empty addresses. */
export function parseRecipients(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Send one multipart (text + HTML) email. TLS: implicit on 465, else STARTTLS
 * (`secure: false`, nodemailer upgrades via STARTTLS when the server offers it).
 */
export async function sendEmail(cfg: SmtpConfig, content: EmailContent): Promise<void> {
  const recipients = parseRecipients(cfg.to);
  if (recipients.length === 0) throw new Error("no recipients configured");

  const transport = createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.username, pass: cfg.password },
  });

  await transport.sendMail({
    from: cfg.from,
    to: recipients,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
}
