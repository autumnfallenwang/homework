"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { SessionGate } from "@/components/auth/session-gate";
import { ChildSidebar } from "@/components/shell/child-sidebar";

const ThemeProvider = dynamic(
  () => import("@/components/theme/theme-provider").then((m) => m.ThemeProvider),
  { ssr: false },
);

/** The child's area (ADR 0004): only a signed-in child gets past the gate. */
export default function ChildLayout({ children }: { children: ReactNode }) {
  return (
    <SessionGate requiredRole="child">
      <ThemeProvider />
      <div
        className="flex flex-col md:flex-row"
        style={{ minHeight: "calc(100vh / var(--font-scale, 1))" }}
      >
        <ChildSidebar />
        <main className="flex flex-1 flex-col overflow-x-hidden">{children}</main>
      </div>
    </SessionGate>
  );
}
