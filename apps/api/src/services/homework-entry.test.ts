import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { firstDayEndsAt, sniffPhotoType } from "./homework-entry.js";

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

describe("firstDayEndsAt (ADR 0008)", () => {
  // The cluster's zone; the cutoff follows the server's TZ.
  const zone = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/New_York";
  });
  afterAll(() => {
    process.env.TZ = zone;
  });
  const ends = (added: string) => firstDayEndsAt(new Date(added)).toISOString();

  it("ends at the next 7 AM: the whole homework evening, locked before school", () => {
    expect(ends("2026-10-02T16:00:00-04:00")).toBe("2026-10-03T11:00:00.000Z"); // Fri 4 PM → Sat 7 AM
    expect(ends("2026-10-02T23:30:00-04:00")).toBe("2026-10-03T11:00:00.000Z"); // Fri 11:30 PM → Sat 7 AM
    expect(ends("2026-10-03T00:30:00-04:00")).toBe("2026-10-03T11:00:00.000Z"); // after midnight → same morning
    expect(ends("2026-10-03T06:59:00-04:00")).toBe("2026-10-03T11:00:00.000Z");
    expect(ends("2026-10-03T07:00:00-04:00")).toBe("2026-10-04T11:00:00.000Z"); // 7 AM sharp → next day
  });

  it("stays at 7 AM local across the clock changes", () => {
    expect(ends("2026-10-31T20:00:00-04:00")).toBe("2026-11-01T12:00:00.000Z"); // fall back: 7 AM EST
    expect(ends("2027-03-13T20:00:00-05:00")).toBe("2027-03-14T11:00:00.000Z"); // spring forward: 7 AM EDT
  });
});
