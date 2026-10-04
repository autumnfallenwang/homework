"use client";

import type { HomeworkItemList } from "@homework/shared";
import { Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { HomeworkEntryOff } from "@/components/homework/entry-off";
import { describeHomeworkError } from "@/components/homework/homework-form";
import { HomeworkList } from "@/components/homework/homework-list";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { getChildProfile, getMyHomework } from "@/lib/api";

/** The child's Homework tab (ADR 0006): their list, grouped by when things are due. */
export default function ChildHomeworkPage() {
  const [entryOn, setEntryOn] = useState<boolean | null>(null);
  const [list, setList] = useState<HomeworkItemList | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [profile, mine] = await Promise.all([getChildProfile(), getMyHomework()]);
      setEntryOn(profile.homeworkEntry);
      setList(mine);
    } catch (err) {
      setError(describeHomeworkError(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Homework"
        actions={
          entryOn ? (
            <Button size="sm" asChild>
              <Link href="/child/homework/new">
                <Plus className="h-4 w-4" />
                Add homework
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-5 md:px-5">
        {error ? (
          <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-[13px] text-destructive">
            {error}
          </p>
        ) : null}
        {entryOn === null || !list ? (
          error ? null : (
            <Loader2 className="mx-auto mt-8 h-5 w-5 animate-spin text-muted-foreground" />
          )
        ) : entryOn ? (
          <HomeworkList
            items={list.items}
            today={list.today}
            mode="child"
            itemHref={(i) => `/child/homework/${i.id}`}
          />
        ) : (
          <HomeworkEntryOff />
        )}
      </div>
    </>
  );
}
