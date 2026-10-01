"use client";

import { ClipboardList, Settings, Upload } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { AccountFooter } from "@/components/shell/account-footer";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

/** The child's whole app: two tabs (ADR 0004 / stage plan)… */
export const CHILD_NAV: readonly NavItem[] = [
  { href: "/child", label: "Homework", icon: ClipboardList },
  { href: "/child/solutions", label: "Solutions", icon: Upload },
];

/** …and their own settings, at the bottom like the parent's. */
const CHILD_UTILITY_NAV: readonly NavItem[] = [
  { href: "/child/settings", label: "Settings", icon: Settings },
];

function DesktopLink({ item, pathname }: { item: NavItem; pathname: string | null }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors ${
        isActive(pathname, item.href)
          ? "bg-secondary font-medium text-foreground"
          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  // The Add / Edit homework pages belong to the Homework tab.
  if (href === "/child") return pathname === "/child" || pathname.startsWith("/child/homework");
  return pathname.startsWith(href);
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
        <span
          className="text-sm font-semibold text-primary"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          H
        </span>
      </div>
      <span
        className="text-[13px] font-semibold tracking-tight"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        Homework
      </span>
    </div>
  );
}

/** A sidebar on a laptop, a top bar with tabs on a phone. */
export function ChildSidebar() {
  const pathname = usePathname();
  return (
    <>
      <aside
        className="hidden w-48 shrink-0 flex-col border-r bg-card/60 md:flex"
        style={{ height: "calc(100vh / var(--font-scale, 1))" }}
      >
        <div className="px-3.5 py-3">
          <Brand />
        </div>
        <nav className="flex flex-col gap-0.5 px-2 py-1">
          {CHILD_NAV.map((item) => (
            <DesktopLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>
        <nav className="mt-auto flex flex-col gap-0.5 px-2 py-1">
          {CHILD_UTILITY_NAV.map((item) => (
            <DesktopLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>
        <AccountFooter />
      </aside>

      <header className="border-b bg-card/80 md:hidden">
        <div className="flex items-center justify-between px-3 py-2">
          <Brand />
          <AccountFooter collapsed inline />
        </div>
        <nav className="flex gap-1 px-2 pb-2">
          {[...CHILD_NAV, ...CHILD_UTILITY_NAV].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 rounded-md px-3 py-1.5 text-center text-[13px] ${
                isActive(pathname, item.href) ? "bg-secondary font-medium" : "text-muted-foreground"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
    </>
  );
}
