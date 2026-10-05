"use client";

import type { ChildRecord, HomeworkItemList } from "@homework/shared";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { HomeworkList } from "@/components/homework/homework-list";
import { PageHeader } from "@/components/shell/page-header";
import { useSelectedChild } from "@/hooks/use-selected-child";
import { getChildHomeworkItems, getChildren } from "@/lib/api";

/**
 * The parent's Review tab (ADR 0006): everything the child picked in the sidebar
 * entered. The parent views, and can delete any item (ADR 0012).
 */
export default function ReviewPage() {
  const { selectedChildId } = useSelectedChild();
  const [children, setChildren] = useState<ChildRecord[] | null>(null);
  const [list, setList] = useState<HomeworkItemList | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getChildren()
      .then(setChildren)
      .catch(() => setError("Could not load the children."));
  }, []);

  const child = children?.find((c) => c.id === selectedChildId) ?? children?.[0] ?? null;
  const entryOn = child?.homeworkSource === "child";

  useEffect(() => {
    setList(null);
    if (child?.homeworkSource !== "child") return;
    getChildHomeworkItems(child.id)
      .then(setList)
      .catch(() => setError("Could not load the homework."));
  }, [child]);

  return (
    <>
      <PageHeader title="Review" />
      <div className="mx-auto w-full max-w-2xl space-y-4 px-5 py-6">
        {error ? <p className="text-[0.8125rem] text-destructive">{error}</p> : null}
        {children === null && !error ? (
          <Loader2 className="mx-auto mt-6 h-5 w-5 animate-spin text-muted-foreground" />
        ) : null}
        {children && !child ? <Notice>Add a child in Settings → Children first.</Notice> : null}
        {child && !entryOn ? (
          <Notice>
            This homework comes from the class homework page. Turn on “Child enters homework” in
            Settings → Children to review entered homework here.
          </Notice>
        ) : null}
        {child && entryOn ? (
          <>
            {list ? (
              <HomeworkList
                items={list.items}
                today={list.today}
                mode="parent"
                itemHref={(i) => `/review/homework/${i.id}`}
                onDeleted={(id) =>
                  setList((l) => l && { ...l, items: l.items.filter((i) => i.id !== id) })
                }
              />
            ) : error ? null : (
              <Loader2 className="mx-auto mt-6 h-5 w-5 animate-spin text-muted-foreground" />
            )}
          </>
        ) : null}
      </div>
    </>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-card px-4 py-4 text-[0.8125rem] leading-relaxed text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {children}
    </p>
  );
}
