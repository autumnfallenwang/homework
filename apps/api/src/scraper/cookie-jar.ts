// Minimal cookie jar scoped to a single scrape session. Parses Set-Cookie
// values, keeps only name=value (ignores attributes), and serializes back out
// as a "name=value; name=value" Cookie header. Ported verbatim from the
// desktop app — manual cookie handling removes any dependency on whether the
// underlying fetch client persists cookies across calls.

export class CookieJar {
  private readonly cookies = new Map<string, string>();

  /**
   * Absorb an array of Set-Cookie header values. Use with
   * `response.headers.getSetCookie()`, which preserves each cookie as its own
   * entry rather than folding them into one comma-joined string.
   */
  absorb(setCookieHeaders: readonly string[]): void {
    for (const header of setCookieHeaders) {
      this.absorbOne(header);
    }
  }

  /** Absorb a single Set-Cookie value (first name=value segment only). */
  absorbOne(setCookieHeader: string): void {
    const firstSegment = setCookieHeader.split(";", 1)[0]?.trim();
    if (!firstSegment) return;

    const eqIdx = firstSegment.indexOf("=");
    if (eqIdx < 0) return;

    const name = firstSegment.slice(0, eqIdx).trim();
    const value = firstSegment.slice(eqIdx + 1).trim();
    if (!name) return;

    this.cookies.set(name, value);
  }

  /** Build a Cookie header value. Empty string when the jar is empty. */
  header(): string {
    return [...this.cookies].map(([n, v]) => `${n}=${v}`).join("; ");
  }

  get size(): number {
    return this.cookies.size;
  }
}
