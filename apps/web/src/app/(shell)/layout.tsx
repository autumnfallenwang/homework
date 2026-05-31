"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SettingsSidebar } from "@/components/shell/settings-sidebar";
import { Sidebar } from "@/components/shell/sidebar";

const ThemeProvider = dynamic(
  () => import("@/components/theme/theme-provider").then((m) => m.ThemeProvider),
  { ssr: false },
);

const DisclaimerGate = dynamic(
  () => import("@/components/shell/disclaimer-gate").then((m) => m.DisclaimerGate),
  { ssr: false },
);

export default function ShellLayout({ children }: { children: ReactNode }) {
  // Phase 30 / D-23 — settings routes get a settings-specific sidebar
  // (Back row + tab list). Everything else gets the main nav sidebar.
  const pathname = usePathname() ?? "";
  const inSettings = pathname.startsWith("/settings");

  return (
    <DisclaimerGate>
      <ThemeProvider />
      {/* Height = 100vh / --font-scale — globals.css applies `zoom` to <html>
          which scales content but not viewport units, so we compensate here
          and in the sidebars to keep the shell exactly viewport-tall and pin
          the bottom-aligned utility nav (Settings/About) on screen. */}
      <div className="flex" style={{ height: "calc(100vh / var(--font-scale, 1))" }}>
        {inSettings ? <SettingsSidebar /> : <Sidebar />}
        <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain">
          <main className="flex flex-1 flex-col overflow-x-hidden">{children}</main>
        </div>
      </div>
    </DisclaimerGate>
  );
}
