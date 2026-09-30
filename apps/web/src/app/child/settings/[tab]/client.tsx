"use client";

import dynamic from "next/dynamic";
import { notFound, useParams } from "next/navigation";
import { CHILD_SETTINGS_TABS, isSettingsTab } from "@/components/shell/settings-sidebar";

// The parent's SettingsView, limited to a child's tabs (Account, Appearance).
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

export function ChildSettingsTabClient() {
  const { tab } = useParams<{ tab: string }>();
  if (!isSettingsTab(tab, CHILD_SETTINGS_TABS)) {
    notFound();
  }
  return <SettingsView tab={tab} />;
}
