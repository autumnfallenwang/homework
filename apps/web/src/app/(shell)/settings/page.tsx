"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Bare /settings redirects to the first tab (children). Settings tabs
// live as dynamic [tab] routes per Phase 30 / D-23.
export default function SettingsIndex() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings/children");
  }, [router]);
  return null;
}
