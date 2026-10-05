"use client";

// Settings-specific sidebar (Phase 30 / D-23). Replaces the main sidebar
// while in settings — Back row + "Settings" eyebrow + one row per tab.
// Derives the active tab from the URL itself so the layout doesn't have to
// thread state through. The SAME component serves both roles (ADR 0004): the
// parent's /settings (7 tabs, Back → Today) and a child's /child/settings
// (Account + Appearance, Back → /child).

import {
  ArrowLeft,
  Bell,
  BookUser,
  CircleUser,
  Download,
  Eye,
  FlagTriangleRight,
  type LucideIcon,
  PanelLeft,
  Settings as SettingsIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AccountFooter } from "@/components/shell/account-footer";
import { Button } from "@/components/ui/button";
import { usePref } from "@/hooks/use-pref";

export type SettingsTab =
  | "account"
  | "children"
  | "appearance"
  | "attention"
  | "fetch"
  | "notifications"
  | "advanced";

export interface SettingsTabItem {
  readonly key: SettingsTab;
  readonly label: string;
  readonly icon: LucideIcon;
}

const COLLAPSED_KEY = "ui.sidebarCollapsed";

export const PARENT_SETTINGS_TABS: readonly SettingsTabItem[] = [
  // Your own login (ADR 0004) — first, as most apps put the account.
  { key: "account", label: "Account", icon: CircleUser },
  { key: "children", label: "Children", icon: BookUser },
  { key: "appearance", label: "Appearance", icon: Eye },
  { key: "attention", label: "Attention", icon: FlagTriangleRight },
  { key: "fetch", label: "Fetch", icon: Download },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "advanced", label: "Advanced", icon: SettingsIcon },
];

/** A child's settings: their own login and how the app looks — nothing of the parent's. */
export const CHILD_SETTINGS_TABS: readonly SettingsTabItem[] = PARENT_SETTINGS_TABS.filter(
  (t) => t.key === "account" || t.key === "appearance",
);

export function isSettingsTab(
  value: unknown,
  tabs: readonly SettingsTabItem[] = PARENT_SETTINGS_TABS,
): value is SettingsTab {
  return typeof value === "string" && tabs.some((t) => t.key === value);
}

export function tabFromPathname(
  pathname: string,
  basePath: string,
  tabs: readonly SettingsTabItem[],
): SettingsTab | undefined {
  const rest = pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length + 1) : "";
  const key = rest.split("/")[0];
  return isSettingsTab(key, tabs) ? key : undefined;
}

export function SettingsSidebar({
  tabs = PARENT_SETTINGS_TABS,
  basePath = "/settings",
  backHref = "/",
}: {
  tabs?: readonly SettingsTabItem[];
  basePath?: string;
  /** Where Back goes: the role's home. */
  backHref?: string;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const activeTab = tabFromPathname(pathname, basePath, tabs);
  const [collapsedRaw, setCollapsedRaw] = usePref(COLLAPSED_KEY, "false");
  const collapsed = collapsedRaw === "true";
  // Labels show only when expanded AND the screen is at least tablet-wide;
  // on a phone the sidebar is always an icon rail.
  const label = collapsed ? "hidden" : "hidden md:inline";

  // Always exits settings to the role's home. `router.back()` walks browser
  // history one step, but each tab click in the settings sidebar pushes
  // a history entry, so "back" rewinds tab-by-tab instead of exiting
  // settings — surprising. Going home is predictable.
  const handleBack = () => {
    router.push(backHref);
  };

  return (
    <aside
      // Visible-screen tall, like sidebar.tsx.
      className={`flex shrink-0 flex-col border-r bg-card/60 backdrop-blur-sm transition-[width] duration-200 ${
        collapsed ? "w-14" : "w-14 md:w-48"
      }`}
      style={{ height: "100dvh" }}
    >
      <div className="flex items-center justify-between px-2.5 py-3">
        <span
          className={`pl-1 text-[0.8125rem] font-semibold tracking-tight ${label}`}
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Settings
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsedRaw(collapsed ? "false" : "true")}
          className="hidden h-7 w-7 shrink-0 md:inline-flex"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <PanelLeft className="h-3.5 w-3.5" />
        </Button>
      </div>

      <nav className="flex flex-col gap-0.5 px-2 py-1">
        <button
          type="button"
          onClick={handleBack}
          title="Back"
          className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[0.8125rem] text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span className={label}>Back</span>
        </button>
      </nav>

      <nav className="flex flex-col gap-0.5 px-2 py-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.key === activeTab;
          return (
            <Link
              key={tab.key}
              href={`${basePath}/${tab.key}`}
              title={tab.label}
              className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[0.8125rem] transition-colors ${
                active
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className={label}>{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto">
        <AccountFooter collapsed={collapsed} railOnMobile />
      </div>
    </aside>
  );
}
