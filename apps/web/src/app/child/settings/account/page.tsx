"use client";

import { AccountSettings } from "@/components/settings/account-settings";
import { ChildSettingsHeader } from "@/components/shell/child-settings-header";

/** A child's own login: who they are, and a new password. */
export default function ChildAccountPage() {
  return (
    <>
      <ChildSettingsHeader />
      <div className="mx-auto w-full max-w-lg px-4 py-5 md:px-5">
        <AccountSettings />
      </div>
    </>
  );
}
