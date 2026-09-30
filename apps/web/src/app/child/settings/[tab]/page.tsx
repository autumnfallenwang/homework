import { ChildSettingsTabClient } from "./client";

// Same shape as the parent's settings/[tab]: every valid tab is enumerated at
// build time (server component), the rendering lives in ./client.tsx.
export function generateStaticParams() {
  return [{ tab: "account" }, { tab: "appearance" }];
}

export default function ChildSettingsTabPage() {
  return <ChildSettingsTabClient />;
}
