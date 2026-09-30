"use client";

import { Camera, ClipboardCheck, ClipboardList, KeyRound } from "lucide-react";
import Link from "next/link";
import { ComingSoonCard } from "@/components/coming-soon-card";
import { PageHeader } from "@/components/shell/page-header";

/**
 * The parent's Review tab. Stage 1 ships only the doorway: child logins are live
 * (Settings → Children); what the children enter and hand in arrives in stages 2–4.
 */
export default function ReviewPage() {
  return (
    <>
      <PageHeader title="Review" />
      <div className="mx-auto w-full max-w-2xl space-y-4 px-5 py-6">
        <div className="rounded-lg bg-card px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <KeyRound className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[14px] font-medium">Child logins are ready</p>
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Give a child their own login from{" "}
                <Link
                  href="/settings/children"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Settings → Children
                </Link>
                : create an invite link and send it to them. They pick a username and password and
                see only their own area.
              </p>
            </div>
          </div>
        </div>

        <ComingSoonCard
          stage={2}
          icon={ClipboardList}
          title="Homework the children entered"
          description="Every item a child adds — class, given and due dates, details — also shows on Today and in the email digest."
        />
        <ComingSoonCard
          stage={3}
          icon={Camera}
          title="Screenshots"
          description="The photos behind each item, and what was read from them."
        />
        <ComingSoonCard
          stage={4}
          icon={ClipboardCheck}
          title="Waiting for your review"
          description="Finished work the children handed in: approve it, or send it back with a note."
        />
      </div>
    </>
  );
}
