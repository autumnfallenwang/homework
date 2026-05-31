"use client";

// First-run disclaimer gate. Single screen; acknowledging writes
// `wizard.disclaimerAcknowledgedAt` to localStorage and navigates to the
// dashboard. No skip. Add-child + notifications guidance lives in the README
// quickstart (linked below).

import { Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { writePref } from "@/hooks/use-pref";
import { APP_NAME, DISCLAIMER_FULL, PRIVACY_NOTICE, REPO_URL, RESPONSIBLE_USE } from "@/lib/legal";

const QUICKSTART_URL = `${REPO_URL}#quick-start`;
const ACK_KEY = "wizard.disclaimerAcknowledgedAt";

export function SetupWizard() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleAcknowledge = () => {
    setBusy(true);
    try {
      writePref(ACK_KEY, new Date().toISOString());
      router.replace("/");
    } catch (e) {
      console.error(
        `wizard: disclaimer save failed — ${e instanceof Error ? e.message : "unknown"}`,
      );
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-5">
      <div className="w-full max-w-xl space-y-5 rounded-xl border bg-card p-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[18px] font-medium" style={{ fontFamily: "var(--font-heading)" }}>
              {`Welcome to ${APP_NAME}`}
            </h1>
            <p className="text-[12px] text-muted-foreground">A quick note before you start</p>
          </div>
        </div>

        <div className="max-h-[50vh] space-y-4 overflow-y-auto rounded-lg border border-border bg-secondary/20 p-4 text-[13px] leading-relaxed">
          <DisclaimerBlock title="What this is" body={DISCLAIMER_FULL} />
          <DisclaimerBlock title="Your privacy" body={PRIVACY_NOTICE} />
          <DisclaimerBlock title="Responsible use" body={RESPONSIBLE_USE} />
        </div>

        <p className="text-[12px] text-muted-foreground">
          <a
            href={QUICKSTART_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary underline-offset-4 hover:underline"
          >
            Read the quick start guide
          </a>
        </p>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" size="sm" disabled={busy} onClick={handleAcknowledge}>
            {busy ? "Saving…" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DisclaimerBlock({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="text-[13px] font-medium">{title}</p>
      <p className="mt-1 whitespace-pre-line text-[12px] text-muted-foreground">{body}</p>
    </div>
  );
}
