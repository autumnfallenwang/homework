"use client";

import type { HomeworkItem } from "@homework/shared";
import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { HomeworkDetail } from "@/components/homework/homework-detail";
import { PageHeader } from "@/components/shell/page-header";
import { ApiClientError, getHomeworkItem } from "@/lib/api";

/** One item a child entered, read only (ADR 0006). */
export default function ReviewHomeworkItemPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<HomeworkItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItem(null);
    setError(null);
    getHomeworkItem(id)
      .then(setItem)
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
      {item ? (
        <HomeworkDetail item={item} />
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
