"use client";

import type { HomeworkItem } from "@homework/shared";
import { Check } from "lucide-react";
import Link from "next/link";
import { homeworkPhotoUrl } from "@/lib/api";
import { formatAddedAt, formatShortDay } from "@/lib/homework-format";
import { KindBadge } from "./kind-badge";

/** One item of a child's list, as the parent sees it: read only (ADR 0006). */
export function HomeworkDetail({ item }: { item: HomeworkItem }) {
  const name = item.createdByName ?? "Your child";
  const done = item.status === "done";
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-5 md:px-6">
      <Link href="/review" className="text-[13px] text-muted-foreground hover:text-foreground">
        ← {item.createdByName ? `${item.createdByName}'s homework` : "Homework"}
      </Link>
      <h2
        className="mt-2 text-2xl font-medium [overflow-wrap:anywhere]"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        {item.title}
      </h2>
      <div className="mt-2 mb-6 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-muted-foreground">
        <span className="rounded-full bg-primary/10 px-2 py-px text-[11px] font-medium text-primary">
          {item.className}
        </span>
        <KindBadge kind={item.kind} />
        <span>
          {item.kind === "test" ? "Test day" : "Due"} {formatShortDay(item.dueOn)}
        </span>
        <span aria-hidden="true">·</span>
        {done ? (
          <span className="flex items-center gap-1 text-meeting">
            <Check className="h-3.5 w-3.5" />
            Done
          </span>
        ) : (
          <span>To do</span>
        )}
      </div>
      <div className="grid gap-7 md:grid-cols-[minmax(0,1fr)_340px] md:items-start">
        <dl className="space-y-4 text-[14px]">
          <div className="space-y-1">
            <dt className="text-[12px] font-semibold">Details</dt>
            <dd
              className={`whitespace-pre-line [overflow-wrap:anywhere] ${item.details ? "" : "text-muted-foreground italic"}`}
            >
              {item.details ?? "None"}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-[12px] font-semibold">Added by</dt>
            <dd>
              {name} · {formatAddedAt(item.createdAt)}
            </dd>
          </div>
          {done && item.completedAt ? (
            <div className="space-y-1">
              <dt className="text-[12px] font-semibold">Done</dt>
              <dd>{formatAddedAt(item.completedAt)}</dd>
            </div>
          ) : null}
        </dl>
        <div className="space-y-2">
          <p className="text-[12px] font-semibold">Photos</p>
          {item.photos.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-5 text-center text-[13px] text-muted-foreground">
              No photos
            </p>
          ) : (
            item.photos.map((p, i) => (
              <a
                key={p.id}
                href={homeworkPhotoUrl(item.id, p.id)}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-lg bg-muted"
              >
                {/* biome-ignore lint/performance/noImgElement: photos come from the API with the session cookie */}
                <img
                  src={homeworkPhotoUrl(item.id, p.id)}
                  alt={`${item.title} (${i + 1} of ${item.photos.length})`}
                  className="w-full object-contain"
                />
              </a>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
