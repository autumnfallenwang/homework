"use client";

import { MessageSquare, Upload } from "lucide-react";
import { ComingSoonCard } from "@/components/coming-soon-card";
import { PageHeader } from "@/components/shell/page-header";

/** The child's Solutions tab — all of it arrives in stage 4. */
export default function ChildSolutionsPage() {
  return (
    <>
      <PageHeader title="Solutions" />
      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-5 md:px-5">
        <ComingSoonCard
          stage={4}
          icon={Upload}
          title="Hand in your work"
          description="When a homework item is done, mark it done and upload photos of your finished work for a parent to review."
          action="Upload my work"
        />
        <ComingSoonCard
          stage={4}
          icon={MessageSquare}
          title="Feedback from your parent"
          description="See which items were approved, and which came back with a note to fix something."
        />
      </div>
    </>
  );
}
