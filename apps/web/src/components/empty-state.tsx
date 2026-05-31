"use client";

import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { REPO_URL } from "@/lib/legal";
import { Button } from "./ui/button";

const QUICKSTART_URL = `${REPO_URL}#quick-start`;

export function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-12 text-center">
      <div className="relative">
        <div className="absolute -inset-4 rounded-full bg-primary/5" />
        <div className="relative rounded-2xl bg-card p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          <GraduationCap className="h-10 w-10 text-primary" strokeWidth={1.5} />
        </div>
      </div>

      <div className="space-y-3">
        <h2
          className="text-2xl font-medium tracking-tight"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Welcome to Parent Companion
        </h2>
        <p className="mx-auto max-w-[320px] text-[14px] leading-relaxed text-muted-foreground">
          No children are set up yet. Add your first child and we'll keep track of grades and
          missing assignments — right here on your computer.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <Button size="lg" className="rounded-xl px-6" asChild>
          <Link href="/settings">Add your first child</Link>
        </Button>
        <a
          href={QUICKSTART_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="text-[12px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          New here? Read the quick start →
        </a>
      </div>
    </div>
  );
}
