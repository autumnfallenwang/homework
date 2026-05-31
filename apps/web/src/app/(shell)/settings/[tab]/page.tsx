import { SettingsTabClient } from "./client";

// Required by Next's static-export mode (`output: "export"`). Every valid
// settings tab is enumerated at build time so a static HTML file is
// generated per tab. Must live in a server component (no `"use client"`),
// which is why the actual rendering logic is split into ./client.tsx.
export function generateStaticParams() {
  return [
    { tab: "children" },
    { tab: "appearance" },
    { tab: "attention" },
    { tab: "fetch" },
    { tab: "notifications" },
    { tab: "advanced" },
  ];
}

export default function SettingsTabPage() {
  return <SettingsTabClient />;
}
