"use client";

import type { ChildProfile } from "@homework/shared";
import { Camera, ClipboardList, Plus, User } from "lucide-react";
import { useEffect, useState } from "react";
import { useMe } from "@/components/auth/session-gate";
import { ComingSoonCard } from "@/components/coming-soon-card";
import { PageHeader } from "@/components/shell/page-header";
import { getChildProfile } from "@/lib/api";

/** The child's Homework tab. Stage 1: their real profile, and what stages 2–3 will add. */
export default function ChildHomeworkPage() {
  const me = useMe();
  const [profile, setProfile] = useState<ChildProfile | null>(null);

  useEffect(() => {
    void getChildProfile()
      .then(setProfile)
      .catch(() => setProfile(null));
  }, []);

  return (
    <>
      <PageHeader title="Homework" />
      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-5 md:px-5">
        <div className="rounded-lg bg-card px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium" data-testid="child-profile-name">
                {profile?.displayName ?? me.child?.displayName ?? "…"}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {[profile?.grade, profile?.school].filter(Boolean).join(" · ") ||
                  `Signed in as ${me.user.email}`}
              </p>
            </div>
          </div>
        </div>

        <ComingSoonCard
          stage={2}
          icon={ClipboardList}
          title="My homework"
          description="Everything you have to do, by day and by class — with what is due next at the top."
        />
        <ComingSoonCard
          stage={2}
          icon={Plus}
          title="Add homework"
          description="Pick the class, the day it was given and the day it is due, then write what to do."
          action="Add homework"
        />
        <ComingSoonCard
          stage={3}
          icon={Camera}
          title="Start from a screenshot"
          description="Take a photo of the board or the assignment; Homework reads it and fills in the form for you to check."
          action="Upload a screenshot"
        />
      </div>
    </>
  );
}
