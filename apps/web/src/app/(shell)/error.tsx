"use client";

import { Button } from "@/components/ui/button";

/**
 * A page that failed to render. For a server-side failure Next hands over
 * `digest` — the id on the `web.request_error` line the server just wrote to
 * Loki — so the reference shown here finds exactly that line:
 * `{namespace="homework"} | json | digest="…"`.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-12 text-center">
      <div className="space-y-3">
        <h2
          className="text-2xl font-medium tracking-tight"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          This page could not load
        </h2>
        <p className="mx-auto max-w-[22.5rem] text-[0.875rem] leading-relaxed text-muted-foreground">
          Grades, homework and the scheduled digests are not affected — they keep running on the
          server.
        </p>
        {error.digest ? (
          <p className="text-xs text-muted-foreground">
            Reference: <span className="select-all font-mono">{error.digest}</span>
          </p>
        ) : null}
      </div>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
