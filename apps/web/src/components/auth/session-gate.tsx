"use client";

import type { Me, Role } from "@homework/shared";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { getMe, homeFor } from "@/lib/auth-client";

const MeContext = createContext<Me | null>(null);

/** The signed-in user, inside a `SessionGate`. */
export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe() used outside a SessionGate");
  return me;
}

/**
 * Renders its children only for a signed-in user of `requiredRole`: nobody → /sign-in,
 * the other role → their own area. Routing convenience only — the API enforces
 * every rule on its own (ADR 0004).
 */
export function SessionGate({
  requiredRole,
  children,
}: {
  requiredRole: Role;
  children: ReactNode;
}) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getMe()
      .then((result) => {
        if (cancelled) return;
        if (!result) router.replace("/sign-in");
        else if (result.user.role !== requiredRole) router.replace(homeFor(result));
        else setMe(result);
      })
      .catch(() => {
        if (!cancelled) router.replace("/sign-in");
      });
    return () => {
      cancelled = true;
    };
  }, [requiredRole, router]);

  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}
