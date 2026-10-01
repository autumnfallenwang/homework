import { describe, expect, it } from "vitest";
import { sniffPhotoType } from "./homework-entry.js";

describe("sniffPhotoType", () => {
  it("knows JPEG, PNG and WebP by their first bytes, whatever they claim to be", () => {
    expect(sniffPhotoType(Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0]))).toBe("image/jpeg");
    expect(sniffPhotoType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      "image/png",
    );
    expect(sniffPhotoType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  });

  it("refuses anything else, including HEIC and text", () => {
    expect(sniffPhotoType(new TextEncoder().encode("<svg xmlns="))).toBeNull();
    expect(sniffPhotoType(new TextEncoder().encode("\0\0\0\x18ftypheic"))).toBeNull();
    expect(sniffPhotoType(new Uint8Array())).toBeNull();
  });
});
