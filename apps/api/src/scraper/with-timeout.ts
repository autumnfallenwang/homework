// Wraps any FetchImpl with an abort-on-timeout guard. Ported verbatim from the
// desktop app — a healthy TeacherEase scrape completes in seconds, but the
// portal occasionally accepts the connection and never responds. Without this,
// a scheduled scrape can hang indefinitely.

import type { FetchImpl } from "./types.js";

/** Default per-request ceiling for scraper HTTP. */
export const DEFAULT_FETCH_TIMEOUT_MS = 60_000;

/** Thrown when a request is aborted by the timeout guard (distinct from a
 *  network error so callers can say "the portal stopped responding"). */
export class FetchTimeoutError extends Error {
  constructor(
    public readonly timeoutMs: number,
    options?: { cause?: unknown },
  ) {
    super(`Request timed out after ${timeoutMs}ms`, options);
    this.name = "FetchTimeoutError";
  }
}

/**
 * Decorate a `FetchImpl` so every request aborts if it has not settled within
 * `timeoutMs`. A caller-supplied `signal` is also honored — the request aborts
 * when either fires.
 */
export function withTimeout(
  inner: FetchImpl,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): FetchImpl {
  return async (url, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const callerSignal = init?.signal;
    if (callerSignal) {
      if (callerSignal.aborted) {
        controller.abort();
      } else {
        callerSignal.addEventListener("abort", () => controller.abort(), { once: true });
      }
    }

    try {
      return await inner(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (
        controller.signal.aborted &&
        !(callerSignal?.aborted ?? false) &&
        err instanceof Error &&
        err.name === "AbortError"
      ) {
        throw new FetchTimeoutError(timeoutMs, { cause: err });
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };
}
