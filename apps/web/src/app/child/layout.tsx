"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SessionGate } from "@/components/auth/session-gate";
import { ChildSidebar } from "@/components/shell/child-sidebar";
import { CHILD_SETTINGS_TABS, SettingsSidebar } from "@/components/shell/settings-sidebar";

/**
 * The child's area (ADR 0004): only a signed-in child gets past the gate. It
 * works like the parent's shell: in settings, the SAME settings sidebar
 * replaces the main navigation (with the child's tabs, Back → /child).
 */
export default function ChildLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const inSettings = pathname.startsWith("/child/settings");

  return (
    <SessionGate requiredRole="child">
      {inSettings ? (
        <div className="flex" style={{ height: "100dvh" }}>
          <SettingsSidebar
            tabs={CHILD_SETTINGS_TABS}
            basePath="/child/settings"
            backHref="/child"
          />
          <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain">
            <main className="flex flex-1 flex-col overflow-x-hidden">{children}</main>
          </div>
        </div>
      ) : (
        // Viewport-tall with its own scroll area, like the parent's shell: <body>
        // is overflow-hidden, so a page taller than the screen (a long item page)
        // must scroll here. min-h-0 lets it shrink under the phone's top bar.
        <div className="flex flex-col md:flex-row" style={{ height: "100dvh" }}>
          <ChildSidebar />
          <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain">
            <main className="flex flex-1 flex-col overflow-x-hidden">{children}</main>
          </div>
        </div>
      )}
    </SessionGate>
  );
}
