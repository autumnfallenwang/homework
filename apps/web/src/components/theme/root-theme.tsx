"use client";

import dynamic from "next/dynamic";

// Applies the appearance preferences on EVERY page, before any login check:
// mounted once in the root layout instead of inside the role-gated layouts,
// so a dark-mode user never sees a light flash while the session loads, and
// /sign-in and /join follow the same preference.
const ThemeProvider = dynamic(
  () => import("@/components/theme/theme-provider").then((m) => m.ThemeProvider),
  { ssr: false },
);

export function RootTheme() {
  return <ThemeProvider />;
}
