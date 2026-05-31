"use client";

// First-run gate (Phase 25 / Q33, M06 web port). The legal disclaimer
// acknowledgement moves to per-browser localStorage. Until the viewer has
// acknowledged, we render a blocking modal over the shell with the disclaimer +
// privacy + responsible-use text. On accept we persist a timestamp and reveal
// the app. Mounts client-only (dynamic ssr:false), so the localStorage read in
// the effect is safe.

import { GraduationCap } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { readPref, writePref } from "@/hooks/use-pref";
import { APP_NAME, DISCLAIMER_FULL, PRIVACY_NOTICE, RESPONSIBLE_USE } from "@/lib/legal";

const ACK_KEY = "wizard.disclaimerAcknowledgedAt";

export function DisclaimerGate({ children }: { children: ReactNode }) {
  // `null` = not yet read (first render / hydration). Render children until we
  // know, so SSR markup and the first client render agree (the modal is added
  // after mount once we read localStorage).
  const [acknowledged, setAcknowledged] = useState<boolean | null>(null);

  useEffect(() => {
    setAcknowledged(readPref(ACK_KEY, "") !== "");
  }, []);

  const handleAccept = () => {
    writePref(ACK_KEY, new Date().toISOString());
    setAcknowledged(true);
  };

  return (
    <>
      {children}
      {acknowledged === false && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/95 p-8 backdrop-blur-sm">
          <div className="w-full max-w-2xl space-y-6 py-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="rounded-2xl bg-primary/10 p-4">
                <GraduationCap className="h-10 w-10 text-primary" strokeWidth={1.5} />
              </div>
              <h1
                className="text-3xl font-semibold tracking-tight"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {`Welcome to ${APP_NAME}`}
              </h1>
              <p className="text-muted-foreground">
                Please read and acknowledge before continuing.
              </p>
            </div>

            <div className="space-y-4 rounded-xl border bg-card p-6">
              <section className="space-y-2">
                <h2 className="font-semibold">Disclaimer</h2>
                <p className="whitespace-pre-line text-sm text-muted-foreground">
                  {DISCLAIMER_FULL}
                </p>
              </section>
              <section className="space-y-2">
                <h2 className="font-semibold">Privacy</h2>
                <p className="whitespace-pre-line text-sm text-muted-foreground">
                  {PRIVACY_NOTICE}
                </p>
              </section>
              <section className="space-y-2">
                <h2 className="font-semibold">Responsible use</h2>
                <p className="whitespace-pre-line text-sm text-muted-foreground">
                  {RESPONSIBLE_USE}
                </p>
              </section>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleAccept}>I understand — continue</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
