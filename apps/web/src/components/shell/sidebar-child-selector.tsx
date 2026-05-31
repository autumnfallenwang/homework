"use client";

import { useCallback, useEffect, useState } from "react";
import { readPref } from "@/hooks/use-pref";
import {
  SELECTED_CHILD_KEY,
  useSelectedChild,
  writeSelectedChildId,
} from "@/hooks/use-selected-child";
import type { ChildRecord } from "@/lib/api";
import { getChildren } from "@/lib/api";

export const CHILD_DATA_REFRESHED_EVENT = "child-data-refreshed";

export function SidebarChildSelector({ collapsed }: { collapsed: boolean }) {
  const { selectedChildId, setSelectedChildId } = useSelectedChild();
  const [children, setChildren] = useState<ChildRecord[]>([]);

  const loadAndReconcile = useCallback(async (): Promise<void> => {
    const all = await getChildren();
    setChildren(all);
    if (all.length === 0) return;

    // Reconcile the saved selection against the current child list. Reads
    // localStorage directly (not React state) to keep this callback closure-free
    // and safe to run from both the mount path and the refresh event.
    const saved = readPref(SELECTED_CHILD_KEY, "");
    const savedIsValid = saved !== "" && all.some((c) => c.id === saved);
    if (!savedIsValid) {
      const preferred = all[0]?.id;
      if (preferred != null) {
        writeSelectedChildId(preferred);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!active) return;
      await loadAndReconcile();
    })();
    return () => {
      active = false;
    };
  }, [loadAndReconcile]);

  useEffect(() => {
    const handler = () => void loadAndReconcile();
    window.addEventListener(CHILD_DATA_REFRESHED_EVENT, handler);
    return () => window.removeEventListener(CHILD_DATA_REFRESHED_EVENT, handler);
  }, [loadAndReconcile]);

  if (children.length === 0 || collapsed) return null;

  const handleSelect = (id: string) => {
    if (id === selectedChildId) return;
    console.info(`sidebar: switched to childId=${id}`);
    setSelectedChildId(id);
  };

  return (
    <>
      <div className="mx-3 my-2 h-px bg-border/60" aria-hidden="true" />
      <div className="px-2">
        <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Viewing
        </p>
        <div className="space-y-0.5">
          {children.map((c) => {
            const isSelected = c.id === selectedChildId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelect(c.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                  isSelected
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground/60 hover:bg-secondary/50"
                }`}
              >
                <span
                  className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                    isSelected ? "bg-foreground" : "bg-transparent"
                  }`}
                  aria-hidden="true"
                />
                <span className="truncate">{c.displayName}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mx-3 my-2 h-px bg-border/60" aria-hidden="true" />
    </>
  );
}
