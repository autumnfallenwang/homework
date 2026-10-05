"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SessionGate } from "@/components/auth/session-gate";
import { SettingsSidebar } from "@/components/shell/settings-sidebar";
import { Sidebar } from "@/components/shell/sidebar";

const DisclaimerGate = dynamic(
  () => import("@/components/shell/disclaimer-gate").then((m) => m.DisclaimerGate),
  { ssr: false },
);

export default function ShellLayout({ children }: { children: ReactNode }) {
  // Phase 30 / D-23 — settings routes get a settings-specific sidebar
  // (Back row + tab list). Everything else gets the main nav sidebar.
  const pathname = usePathname() ?? "";
  const inSettings = pathname.startsWith("/settings");

  // The parent's app (ADR 0004): a child is sent to /child, nobody to /sign-in.
  return (
    <SessionGate requiredRole="parent">
      <DisclaimerGate>
        {/* Exactly as tall as the visible screen (dvh: minus a phone's browser
          bars), so the bottom-aligned nav (Settings/About) stays on screen. */}
        <div className="flex" style={{ height: "100dvh" }}>
          {inSettings ? <SettingsSidebar /> : <Sidebar />}
          <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain">
            <main className="flex flex-1 flex-col overflow-x-hidden">{children}</main>
          </div>
        </div>
      </DisclaimerGate>
    </SessionGate>
  );
}
