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
        <div className="flex" style={{ height: "calc(100vh / var(--font-scale, 1))" }}>
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
        <div
          className="flex flex-col md:flex-row"
          style={{ minHeight: "calc(100vh / var(--font-scale, 1))" }}
        >
          <ChildSidebar />
          <main className="flex flex-1 flex-col overflow-x-hidden">{children}</main>
        </div>
      )}
    </SessionGate>
  );
}
