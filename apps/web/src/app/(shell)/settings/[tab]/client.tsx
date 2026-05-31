"use client";

import dynamic from "next/dynamic";
import { notFound, useParams } from "next/navigation";
import { isSettingsTab } from "@/components/shell/settings-sidebar";

const SettingsView = dynamic(
  () => import("@/components/settings-view").then((m) => m.SettingsView),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    ),
  },
);

export function SettingsTabClient() {
  const params = useParams<{ tab: string }>();
  const tab = params.tab;
  if (!isSettingsTab(tab)) {
    notFound();
  }
  return <SettingsView tab={tab} />;
}
