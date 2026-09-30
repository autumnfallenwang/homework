"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Bare /child/settings opens the first tab, as the parent's /settings does.
export default function ChildSettingsIndex() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/child/settings/account");
  }, [router]);
  return null;
}
