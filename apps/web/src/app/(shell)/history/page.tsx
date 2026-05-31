"use client";

import dynamic from "next/dynamic";

const HistoryView = dynamic(() => import("@/components/history-view").then((m) => m.HistoryView), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Loading...</p>
    </div>
  ),
});

export default function HistoryPage() {
  return <HistoryView />;
}
