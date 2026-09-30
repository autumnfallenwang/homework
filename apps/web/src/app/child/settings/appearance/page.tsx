"use client";

import { SettingsAppearance } from "@/components/settings-appearance";
import { ChildSettingsHeader } from "@/components/shell/child-settings-header";

/** The same Appearance settings as the parent's — kept per browser, so each device has its own. */
export default function ChildAppearancePage() {
  return (
    <>
      <ChildSettingsHeader />
      <div className="mx-auto w-full max-w-lg space-y-5 px-4 py-5 md:px-5">
        <SettingsAppearance />
      </div>
    </>
  );
}
