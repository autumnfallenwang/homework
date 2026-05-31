"use client";

import dynamic from "next/dynamic";

const Dashboard = dynamic(() => import("@/components/dashboard").then((m) => m.Dashboard), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Loading...</p>
    </div>
  ),
});

export default function TodayPage() {
  return <Dashboard />;
}
