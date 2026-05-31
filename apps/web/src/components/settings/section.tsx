"use client";

// Shared Settings section primitive (Phase 23 / SS1). Every sub-tab's
// sections render through this so the grammar stays uniform — title row
// with an info-icon tooltip, card-wrapped content below, consistent
// typography. `card={false}` lets children that already render their own
// shell (e.g. SettingsEmailSection, divide-y switch lists) avoid nesting.

import { Info } from "lucide-react";
import type { ReactNode } from "react";

export interface SettingsSectionProps {
  readonly title: string;
  readonly help?: string;
  readonly children: ReactNode;
  /** Skip the card chrome when the child renders its own card. Default true. */
  readonly card?: boolean;
  /** Danger-zone red border treatment. Default false. */
  readonly danger?: boolean;
}

export function SettingsSection({
  title,
  help,
  children,
  card = true,
  danger = false,
}: SettingsSectionProps) {
  const shell = card
    ? `rounded-lg border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${
        danger ? "border-destructive/30" : "border-border"
      }`
    : "";
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5 px-1">
        <h2 className="text-[14px] font-medium">{title}</h2>
        {help && (
          <span
            role="img"
            aria-label={`${title} help: ${help}`}
            title={help}
            className="cursor-help text-muted-foreground hover:text-foreground"
          >
            <Info className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
      </div>
      <div className={shell}>{children}</div>
    </section>
  );
}
