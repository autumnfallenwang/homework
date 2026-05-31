"use client";

import dynamic from "next/dynamic";

const SetupWizard = dynamic(
  () => import("@/components/wizard/setup-wizard").then((m) => m.SetupWizard),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    ),
  },
);

export default function SetupPage() {
  return <SetupWizard />;
}
