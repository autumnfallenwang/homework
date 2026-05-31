"use client";

// Selected-child state, stored per-browser in localStorage (M06 decision).
// IDs are uuid strings now (M02), so no numeric parsing — a non-empty string
// is the id. Mirrors the desktop hook's API shape so components are unchanged
// apart from the string id type.

import { useCallback, useEffect, useState } from "react";
import { readPref, writePref } from "./use-pref.js";

export const SELECTED_CHILD_KEY = "ui.selectedChildId";

export function writeSelectedChildId(id: string): void {
  writePref(SELECTED_CHILD_KEY, id);
}

export function useSelectedChild(): {
  selectedChildId: string | null;
  setSelectedChildId: (id: string) => void;
} {
  const [selectedChildId, setLocal] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      const raw = readPref(SELECTED_CHILD_KEY, "");
      setLocal(raw === "" ? null : raw);
    };
    read();
    const handler = () => read();
    window.addEventListener(`pref-change:${SELECTED_CHILD_KEY}`, handler);
    return () => window.removeEventListener(`pref-change:${SELECTED_CHILD_KEY}`, handler);
  }, []);

  const setSelectedChildId = useCallback((id: string): void => {
    setLocal(id);
    writeSelectedChildId(id);
  }, []);

  return { selectedChildId, setSelectedChildId };
}
