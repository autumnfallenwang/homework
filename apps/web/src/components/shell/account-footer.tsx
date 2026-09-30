"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { useMe } from "@/components/auth/session-gate";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";

/** Who is signed in, and the way out. Both sidebars. */
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
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium" data-testid="signed-in-name">
            {me.user.name}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {me.user.role === "child" ? `@${me.user.username ?? ""}` : "Parent"}
          </p>
        </div>
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
