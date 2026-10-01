"use client";

import type { ChildRecord, HomeworkItemList } from "@homework/shared";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { HomeworkList } from "@/components/homework/homework-list";
import { PageHeader } from "@/components/shell/page-header";
import { useSelectedChild } from "@/hooks/use-selected-child";
import { getChildHomeworkItems, getChildren } from "@/lib/api";

/**
 * The parent's Review tab (ADR 0006): everything the child picked in the sidebar
 * entered, read only. Approving and sending work back arrive in stage 4.
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
        {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
        {children === null && !error ? (
          <Loader2 className="mx-auto mt-6 h-5 w-5 animate-spin text-muted-foreground" />
        ) : null}
        {children && !child ? (
          <Notice>
            Add a child in{" "}
            <Link href="/settings/children" className="text-primary hover:underline">
              Settings → Children
            </Link>{" "}
            first.
          </Notice>
        ) : null}
        {child && !entryOn ? (
          <Notice>
            {`${child.displayName}'s homework comes from the class homework page. To have ${child.displayName} enter it, turn on “Child enters homework” in `}
            <Link href="/settings/children" className="text-primary hover:underline">
              Settings → Children
            </Link>
            .
          </Notice>
        ) : null}
        {child && entryOn ? (
          <>
            <div className="flex items-center gap-2.5">
              <h2
                className="text-2xl font-medium"
                style={{ fontFamily: "var(--font-heading)" }}
              >{`${child.displayName}'s homework`}</h2>
              <span className="rounded-full bg-muted px-2 py-px text-[11px] text-muted-foreground">
                View only
              </span>
            </div>
            {list ? (
              <HomeworkList
                items={list.items}
                today={list.today}
                mode="parent"
                childName={child.displayName}
                itemHref={(i) => `/review/homework/${i.id}`}
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
    <p className="rounded-lg bg-card px-4 py-4 text-[13px] leading-relaxed text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {children}
    </p>
  );
}
