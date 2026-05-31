"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { SettingsSection } from "@/components/settings/section";
import { Button } from "@/components/ui/button";
import { getAppVersion, resetAllAppData } from "@/lib/api";

export function SettingsAdvanced() {
  const [appVersion, setAppVersion] = useState<string>("…");
  const [resetting, setResetting] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    void getAppVersion()
      .then((v) => setAppVersion(v))
      .catch(() => setAppVersion("unknown"));
  }, []);

  const handleReset = async () => {
    // Inline confirmation panel handles the user decision; this runs only
    // after the user clicks the explicit destructive Reset button.
    setResetting(true);
    try {
      await resetAllAppData();
      // No desktop process to quit — send the user back through onboarding.
      window.location.assign("/setup");
    } catch {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-5">
      <SettingsSection title="About" help="The version of the app currently running.">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-medium">Current version</p>
          <p className="text-[12px] text-muted-foreground">v{appVersion}</p>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Danger zone"
        help="One-way deletion. Back up your data if in doubt."
        danger
      >
        {confirmingReset ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">Reset the app to first-install state?</p>
                <p className="text-[12px] text-muted-foreground">
                  Wipes all data. Cannot be undone. You'll be returned to setup.
                </p>
              </div>
              <Button
                size="sm"
                variant="destructive"
                className="h-8"
                disabled={resetting}
                onClick={() => {
                  void handleReset();
                }}
              >
                {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Reset"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => setConfirmingReset(false)}
                disabled={resetting}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">Reset app</p>
              <p className="text-[12px] text-muted-foreground">
                Wipes all app data and returns to first-install state.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmingReset(true)}
              className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
            >
              Reset app
            </Button>
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
