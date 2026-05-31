"use client";

import { SettingsAdvanced } from "@/components/settings-advanced";
import { SettingsAppearance } from "@/components/settings-appearance";
import { SettingsAttention } from "@/components/settings-attention";
import { SettingsChildren } from "@/components/settings-children";
import { SettingsFetch } from "@/components/settings-fetch";
import { SettingsNotifications } from "@/components/settings-notifications";
import type { SettingsTab } from "@/components/shell/settings-sidebar";

export function SettingsView({ tab }: { tab: SettingsTab }) {
  return (
    <div className="mx-auto w-full max-w-lg space-y-5 px-5 py-6">
      {tab === "children" && <SettingsChildren />}
      {tab === "appearance" && <SettingsAppearance />}
      {tab === "attention" && <SettingsAttention />}
      {tab === "fetch" && <SettingsFetch />}
      {tab === "notifications" && <SettingsNotifications />}
      {tab === "advanced" && <SettingsAdvanced />}
    </div>
  );
}
