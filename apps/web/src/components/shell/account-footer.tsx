"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useMe } from "@/components/auth/session-gate";
import { ROLE_LABEL } from "@/components/settings/account-settings";
import { Button } from "@/components/ui/button";
import { accountPathFor, signOut } from "@/lib/auth-client";

/**
 * Who is signed in, and the way out — every sidebar. The same two lines for
 * every role (name, then role); clicking them opens your Account settings.
 */
export function AccountFooter({
  collapsed = false,
  inline = false,
}: {
  collapsed?: boolean;
  /** Inside a header bar (the child's phone layout): no top rule, no padding. */
  inline?: boolean;
}) {
  const me = useMe();
  const [busy, setBusy] = useState(false);

  async function out() {
    setBusy(true);
    await signOut().catch(() => undefined);
    // A full navigation: nothing of the old session stays in memory.
    window.location.assign("/sign-in");
  }

  return (
    <div className={`flex items-center gap-2 ${inline ? "" : "border-t px-2.5 py-2.5"}`}>
      {!collapsed && (
        <Link
          href={accountPathFor(me.user.role)}
          title="Account settings"
          className="-mx-1 min-w-0 flex-1 rounded-md px-1 py-0.5 hover:bg-secondary/50"
          data-testid="account-link"
        >
          <p className="truncate text-[12px] font-medium" data-testid="signed-in-name">
            {me.user.name}
          </p>
          <p className="truncate text-[11px] text-muted-foreground" data-testid="signed-in-role">
            {ROLE_LABEL[me.user.role]}
          </p>
        </Link>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        title="Sign out"
        aria-label="Sign out"
        onClick={out}
        disabled={busy}
      >
        <LogOut className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
