"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";

/** A child's settings: their own login and how the app looks — nothing of the parent's. */
export const CHILD_SETTINGS_TABS = [
  { href: "/child/settings/account", label: "Account" },
  { href: "/child/settings/appearance", label: "Appearance" },
] as const;

export function ChildSettingsHeader() {
  const pathname = usePathname() ?? "";
  return (
    <PageHeader
      title="Settings"
      subTabs={
        <nav className="flex gap-1 pb-2">
          {CHILD_SETTINGS_TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-md px-3 py-1.5 text-[13px] ${
                pathname.startsWith(tab.href)
                  ? "bg-secondary font-medium"
                  : "text-muted-foreground hover:bg-secondary/50"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      }
    />
  );
}
