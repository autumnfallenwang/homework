"use client";

import dynamic from "next/dynamic";

const ClassesView = dynamic(() => import("@/components/classes-view").then((m) => m.ClassesView), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Loading...</p>
    </div>
  ),
});

export default function ClassesPage() {
  return <ClassesView />;
}
