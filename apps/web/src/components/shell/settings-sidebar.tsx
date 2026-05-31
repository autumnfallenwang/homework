"use client";

// Settings-specific sidebar (Phase 30 / D-23). Replaces the main sidebar
// when pathname starts with /settings — Back row + "Settings" eyebrow +
// 6 tab rows. Derives activeTab from the URL itself so the layout
// doesn't have to thread state through.

import {
  ArrowLeft,
  Bell,
  BookUser,
  Download,
  Eye,
  FlagTriangleRight,
  type LucideIcon,
  PanelLeft,
  Settings as SettingsIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { usePref } from "@/hooks/use-pref";

export type SettingsTab =
  | "children"
  | "appearance"
  | "attention"
  | "fetch"
  | "notifications"
  | "advanced";

interface SettingsTabItem {
  readonly key: SettingsTab;
  readonly label: string;
  readonly icon: LucideIcon;
}

const COLLAPSED_KEY = "ui.sidebarCollapsed";

const TABS: readonly SettingsTabItem[] = [
  { key: "children", label: "Children", icon: BookUser },
  { key: "appearance", label: "Appearance", icon: Eye },
  { key: "attention", label: "Attention", icon: FlagTriangleRight },
  { key: "fetch", label: "Fetch", icon: Download },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "advanced", label: "Advanced", icon: SettingsIcon },
];

export function isSettingsTab(value: unknown): value is SettingsTab {
  return typeof value === "string" && TABS.some((t) => t.key === value);
}

function tabFromPathname(pathname: string): SettingsTab {
  const m = pathname.match(/^\/settings\/([^/]+)/);
  return m && isSettingsTab(m[1]) ? m[1] : "children";
}

export function SettingsSidebar() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const activeTab = tabFromPathname(pathname);
  const [collapsedRaw, setCollapsedRaw] = usePref(COLLAPSED_KEY, "false");
  const collapsed = collapsedRaw === "true";

  // Always exits settings to Today (/). `router.back()` walks browser
  // history one step, but each tab click in the settings sidebar pushes
  // a history entry, so "back" rewinds tab-by-tab instead of exiting
  // settings — surprising. Going home is predictable.
  const handleBack = () => {
    router.push("/");
  };

  return (
    <aside
      // See sidebar.tsx for why we divide 100vh by --font-scale here instead
      // of using h-screen directly.
      className={`flex shrink-0 flex-col border-r bg-card/60 backdrop-blur-sm transition-[width] duration-200 ${
        collapsed ? "w-14" : "w-48"
      }`}
      style={{ height: "calc(100vh / var(--font-scale, 1))" }}
    >
      <div className="flex items-center justify-between px-2.5 py-3">
        {!collapsed && (
          <span
            className="pl-1 text-[13px] font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Settings
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsedRaw(collapsed ? "false" : "true")}
          className="h-7 w-7 shrink-0"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <PanelLeft className="h-3.5 w-3.5" />
        </Button>
      </div>

      <nav className="flex flex-col gap-0.5 px-2 py-1">
        <button
          type="button"
          onClick={handleBack}
          title={collapsed ? "Back" : undefined}
          className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Back</span>}
        </button>
      </nav>

      <nav className="flex flex-col gap-0.5 px-2 py-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.key === activeTab;
          const label = tab.label;
          return (
            <Link
              key={tab.key}
              href={`/settings/${tab.key}`}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors ${
                active
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
