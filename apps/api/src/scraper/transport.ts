// Node fetch transport for the scraper. Replaces the desktop app's Tauri
// plugin-http. Node 22's global fetch supports `redirect: "manual"` (so the
// login 302 is observable) and `Headers.getSetCookie()` (correct multi-cookie
// collection), which is exactly the contract the ported scraper relies on.

import { USER_AGENT } from "./teacherease.js";
import type { FetchImpl } from "./types.js";
import { withTimeout } from "./with-timeout.js";

// Re-export so callers can import the UA from one place.
export { USER_AGENT };

/**
 * Build a `FetchImpl` backed by Node's global fetch, wrapped with the scraper's
 * abort-on-timeout guard. The scraper passes `redirect: "manual"` per request;
 * we don't override it here.
 */
export function createNodeFetch(timeoutMs?: number): FetchImpl {
  const base: FetchImpl = (url, init) => fetch(url, init);
  return withTimeout(base, timeoutMs);
}
