import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture createTransport calls + sendMail payloads without touching the network.
// vi.mock is hoisted above top-level consts, so the mocks must come from
// vi.hoisted (else the factory references an uninitialized binding).
const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn(async () => ({ messageId: "test" }));
  const createTransport = vi.fn(() => ({ sendMail }));
  return { sendMail, createTransport };
});
vi.mock("nodemailer", () => ({ createTransport }));

import { parseRecipients, type SmtpConfig, sendEmail } from "./email.js";

const BASE: SmtpConfig = {
  host: "smtp.example.com",
  port: 587,
  username: "u@e.com",
  password: "secret",
  from: "from@e.com",
  to: "a@e.com, b@e.com",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("parseRecipients", () => {
  it("splits, trims, and drops empties", () => {
    expect(parseRecipients("a@e.com, b@e.com ,, c@e.com")).toEqual([
      "a@e.com",
      "b@e.com",
      "c@e.com",
    ]);
  });
});

describe("sendEmail TLS decision", () => {
  it("uses STARTTLS (secure:false) on port 587", async () => {
    await sendEmail(BASE, { subject: "s", text: "t", html: "<p>h</p>" });
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: "smtp.example.com", port: 587, secure: false }),
    );
  });

  it("uses implicit TLS (secure:true) on port 465", async () => {
    await sendEmail({ ...BASE, port: 465 }, { subject: "s", text: "t", html: "<p>h</p>" });
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true }),
    );
  });

  it("passes parsed recipients to sendMail", async () => {
    await sendEmail(BASE, { subject: "s", text: "t", html: "<p>h</p>" });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["a@e.com", "b@e.com"], subject: "s" }),
    );
  });

  it("throws when there are no recipients", async () => {
    await expect(
      sendEmail({ ...BASE, to: " , " }, { subject: "s", text: "t", html: "h" }),
    ).rejects.toThrow(/no recipients/);
  });
});
