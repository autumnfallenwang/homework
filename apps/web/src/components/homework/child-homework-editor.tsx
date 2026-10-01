"use client";

import type { HomeworkClass, HomeworkItem } from "@homework/shared";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { getChildProfile, getMyHomeworkClasses, getMyHomeworkItem } from "@/lib/api";
import { toLocalIso } from "@/lib/local-date";
import { HomeworkEntryOff } from "./entry-off";
import { describeHomeworkError, HomeworkForm } from "./homework-form";

/** Loads what the Add / Edit page needs, then shows the form (or why it can't). */
export function ChildHomeworkEditor({ itemId }: { itemId: string | null }) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "off" }
    | { kind: "error"; message: string }
    | { kind: "ready"; classes: HomeworkClass[]; item: HomeworkItem | null }
  >({ kind: "loading" });

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const profile = await getChildProfile();
        if (!profile.homeworkEntry) {
          if (live) setState({ kind: "off" });
          return;
        }
        const [classes, item] = await Promise.all([
          getMyHomeworkClasses(),
          itemId ? getMyHomeworkItem(itemId) : Promise.resolve(null),
        ]);
        if (live) setState({ kind: "ready", classes, item });
      } catch (err) {
        if (live) setState({ kind: "error", message: describeHomeworkError(err) });
      }
    })();
    return () => {
      live = false;
    };
  }, [itemId]);

  return (
    <>
      <PageHeader title={itemId ? "Edit homework" : "Add homework"} />
      {state.kind === "loading" ? (
        <Loader2 className="mx-auto mt-10 h-5 w-5 animate-spin text-muted-foreground" />
      ) : state.kind === "off" ? (
        <div className="mx-auto w-full max-w-2xl px-4 py-5">
          <HomeworkEntryOff />
        </div>
      ) : state.kind === "error" ? (
        <p className="mx-auto mt-6 w-full max-w-2xl px-4 text-[13px] text-destructive">
          {state.message}
        </p>
      ) : (
        <HomeworkForm item={state.item} classes={state.classes} today={toLocalIso(new Date())} />
      )}
    </>
  );
}
