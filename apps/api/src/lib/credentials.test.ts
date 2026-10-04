import { describe, expect, it } from "vitest";
import { isSealed, openCredential, sealCredential } from "./credentials.js";

describe("credentials at rest (ADR 0010)", () => {
  it("seals with a fresh IV each time and opens back to the plaintext", () => {
    const a = sealCredential("hunter2 pässwörd");
    const b = sealCredential("hunter2 pässwörd");
    expect(a.startsWith("enc:v1:")).toBe(true);
    expect(a).not.toContain("hunter2");
    expect(a).not.toBe(b);
    expect(openCredential(a)).toBe("hunter2 pässwörd");
    expect(openCredential(b)).toBe("hunter2 pässwörd");
  });

  it("leaves empty and already-sealed values alone, and reads legacy plaintext as is", () => {
    expect(sealCredential("")).toBe("");
    const sealed = sealCredential("x");
    expect(sealCredential(sealed)).toBe(sealed);
    expect(isSealed("plain-old")).toBe(false);
    expect(openCredential("plain-old")).toBe("plain-old");
  });

  it("refuses a value that was tampered with", () => {
    const sealed = sealCredential("secret");
    const raw = Buffer.from(sealed.slice("enc:v1:".length), "base64");
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 0xff;
    expect(() => openCredential(`enc:v1:${raw.toString("base64")}`)).toThrow();
  });
});
