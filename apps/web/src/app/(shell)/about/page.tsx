"use client";

import dynamic from "next/dynamic";

const AboutPage = dynamic(() => import("@/components/about-page").then((m) => m.AboutPage), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Loading...</p>
    </div>
  ),
});

export default function About() {
  return <AboutPage />;
}
