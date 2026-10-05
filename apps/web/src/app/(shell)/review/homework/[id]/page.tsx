"use client";

import type { HomeworkHistoryEntry, HomeworkItem } from "@homework/shared";
import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { HomeworkDetail } from "@/components/homework/homework-detail";
import { PageHeader } from "@/components/shell/page-header";
import { ApiClientError, getHomeworkItem, getHomeworkItemHistory } from "@/lib/api";

/** One item a child entered, with its solution and history; the parent can delete it (ADR 0012). */
export default function ReviewHomeworkItemPage() {
  const { id } = useParams<{ id: string }>();
  const [loaded, setLoaded] = useState<{
    item: HomeworkItem;
    history: HomeworkHistoryEntry[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoaded(null);
    setError(null);
    Promise.all([getHomeworkItem(id), getHomeworkItemHistory(id)])
      .then(([item, history]) => setLoaded({ item, history }))
      .catch((err: unknown) =>
        setError(
          err instanceof ApiClientError && err.status === 404
            ? "This homework no longer exists."
            : "Could not load this homework.",
        ),
      );
  }, [id]);

  return (
    <>
      <PageHeader title="Review" />
      {loaded ? (
        <HomeworkDetail item={loaded.item} history={loaded.history} />
      ) : error ? (
        <p className="mx-auto mt-6 w-full max-w-2xl px-5 text-[13px] text-muted-foreground">
          {error}
        </p>
      ) : (
        <Loader2 className="mx-auto mt-10 h-5 w-5 animate-spin text-muted-foreground" />
      )}
    </>
  );
}
