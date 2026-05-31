"use client";

// Per-viewer UI preferences in localStorage (M06 decision: these are
// per-browser, not shared server state). A tiny typed wrapper with a
// cross-component change event so multiple mounts stay in sync.

import { useCallback, useEffect, useState } from "react";

function prefEventName(key: string): string {
  return `pref-change:${key}`;
}

/** Read a localStorage string (SSR-safe — returns the fallback on the server). */
export function readPref(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem(key) ?? fallback;
}

/** Write a localStorage string and notify other hook instances. */
export function writePref(key: string, value: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
  window.dispatchEvent(new CustomEvent(prefEventName(key)));
}

/**
 * useState-like hook backed by localStorage. Hydrates after mount (so SSR and
 * the first client render agree on the fallback, avoiding hydration mismatch),
 * then re-reads on cross-component change events.
 */
export function usePref(key: string, fallback: string): [string, (value: string) => void] {
  const [value, setValue] = useState(fallback);

  useEffect(() => {
    setValue(readPref(key, fallback));
    const handler = () => setValue(readPref(key, fallback));
    window.addEventListener(prefEventName(key), handler);
    return () => window.removeEventListener(prefEventName(key), handler);
  }, [key, fallback]);

  const set = useCallback(
    (next: string) => {
      setValue(next);
      writePref(key, next);
    },
    [key],
  );

  return [value, set];
}
