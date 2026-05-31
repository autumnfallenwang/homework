"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { getAppVersion } from "@/lib/api";
import { APP_NAME, DISCLAIMER_FULL, PRIVACY_NOTICE, REPO_URL, RESPONSIBLE_USE } from "@/lib/legal";

function Section({ title, content }: { title: string; content: string }) {
  return (
    <div className="space-y-2">
      <h2
        className="text-base font-medium tracking-tight"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        {title}
      </h2>
      <div className="whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
        {content}
      </div>
    </div>
  );
}

export function AboutPage() {
  const [appVersion, setAppVersion] = useState<string>("…");

  useEffect(() => {
    void getAppVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion("unknown"));
  }, []);

  return (
    <>
      <PageHeader title="About" />
      <div className="mx-auto max-w-lg px-5 py-6">
        <div className="space-y-6">
          <div className="flex items-center gap-3 rounded-lg bg-card px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <span
                className="text-lg font-semibold text-primary"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                T
              </span>
            </div>
            <div>
              <p className="text-[14px] font-medium">{APP_NAME}</p>
              <p className="text-[12px] text-muted-foreground">{`Version ${appVersion}`}</p>
            </div>
          </div>

          <Section title="Disclaimer" content={DISCLAIMER_FULL} />
          <Section title="Privacy" content={PRIVACY_NOTICE} />
          <Section title="Responsible use" content={RESPONSIBLE_USE} />

          <div className="flex items-center gap-4 border-t pt-4">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-primary underline-offset-4 hover:underline"
            >
              View source on GitHub
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
