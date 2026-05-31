"use client";

import {
  type AttentionConfig,
  DEFAULT_FORGIVENESS_WEEKS,
  DEFAULT_LOW_SCORE_THRESHOLD,
  parseAttentionConfig,
} from "@homework/shared";
import type { LucideIcon } from "lucide-react";
import { BookX, CheckCircle2, CircleDashed, TrendingDown } from "lucide-react";
import { useEffect, useState } from "react";
import { SettingsSection } from "@/components/settings/section";
import { getSettingString, setSettingString } from "@/lib/api";

// Read-only icon legend (D-04). Mirrors `resolveAssignmentIcon` in standards-
// tree.tsx — if that resolver changes, update this array to keep them in sync.
const ICON_REFERENCE: Array<{
  icon: LucideIcon;
  className: string;
  label: string;
  desc: string;
}> = [
  {
    icon: BookX,
    className: "text-attention",
    label: "Missing (recent)",
    desc: "Assignment flagged as not turned in, within the forgiveness window.",
  },
  {
    icon: BookX,
    className: "text-muted-foreground",
    label: "Missing (older)",
    desc: "Missing item past the forgiveness window — no longer demanding action.",
  },
  {
    icon: TrendingDown,
    className: "text-attention/70",
    label: "Low score (recent)",
    desc: "Graded below the low-score threshold, within the forgiveness window.",
  },
  {
    icon: TrendingDown,
    className: "text-muted-foreground",
    label: "Low score (older)",
    desc: "Low-score item past the forgiveness window.",
  },
  {
    icon: CheckCircle2,
    className: "text-meeting",
    label: "Meeting",
    desc: "Graded at or above the threshold — no attention needed.",
  },
  {
    icon: CircleDashed,
    className: "text-muted-foreground",
    label: "Not graded",
    desc: "Posted to the gradebook but no score entered yet (upcoming or pending).",
  },
];

const WEEKS_KEY = "attention.forgivenessWeeks";
const THRESHOLD_KEY = "attention.lowScoreThreshold";
// Dispatched on save for future live-refresh wiring.  AT5 itself doesn't wire
// listeners — Next.js App Router remounts the dashboard / classes views on
// route navigation, so returning from Settings → Attention triggers a fresh
// loadData → fresh getAttentionConfig() naturally.
const EVENT_NAME = "attention-config-change";

export function SettingsAttention() {
  const [cfg, setCfg] = useState<AttentionConfig>({
    forgivenessWeeks: DEFAULT_FORGIVENESS_WEEKS,
    lowScoreThreshold: DEFAULT_LOW_SCORE_THRESHOLD,
  });
  const [weeksInput, setWeeksInput] = useState(String(DEFAULT_FORGIVENESS_WEEKS));
  const [thresholdInput, setThresholdInput] = useState(String(DEFAULT_LOW_SCORE_THRESHOLD));

  useEffect(() => {
    void Promise.all([getSettingString(WEEKS_KEY, ""), getSettingString(THRESHOLD_KEY, "")]).then(
      ([w, th]) => {
        const parsed = parseAttentionConfig(w, th);
        setCfg(parsed);
        setWeeksInput(String(parsed.forgivenessWeeks));
        setThresholdInput(String(parsed.lowScoreThreshold));
      },
    );
  }, []);

  const saveConfig = async (next: AttentionConfig) => {
    setCfg(next);
    setWeeksInput(String(next.forgivenessWeeks));
    setThresholdInput(String(next.lowScoreThreshold));
    try {
      await setSettingString(WEEKS_KEY, String(next.forgivenessWeeks));
      await setSettingString(THRESHOLD_KEY, String(next.lowScoreThreshold));
      window.dispatchEvent(new CustomEvent(EVENT_NAME));
    } catch {
      // Swallow — the inputs already reflect the attempted value; a transient
      // network blip shouldn't wipe what the user typed.
    }
  };

  const commitWeeks = () => {
    const next = parseAttentionConfig(weeksInput, String(cfg.lowScoreThreshold));
    if (next.forgivenessWeeks === cfg.forgivenessWeeks) {
      // Invalid (or unchanged) — revert display to the current saved value.
      setWeeksInput(String(cfg.forgivenessWeeks));
      return;
    }
    void saveConfig(next);
  };

  const commitThreshold = () => {
    const next = parseAttentionConfig(String(cfg.forgivenessWeeks), thresholdInput);
    if (next.lowScoreThreshold === cfg.lowScoreThreshold) {
      setThresholdInput(String(cfg.lowScoreThreshold));
      return;
    }
    void saveConfig(next);
  };

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Forgiveness window"
        help="How long a missing or low-score item keeps demanding attention before quietly aging into Older. These knobs don't touch TeacherEase grades — they shape the ! / ✓ layer this app overlays. Default 2 weeks."
      >
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={12}
            step={1}
            value={weeksInput}
            onChange={(e) => setWeeksInput(e.target.value)}
            onBlur={commitWeeks}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitWeeks();
              }
            }}
            aria-label="Forgiveness window in weeks"
            className="h-8 w-20 rounded-md border border-input bg-card px-2 text-[13px] text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <span className="text-[12px] text-muted-foreground">
            weeks (1–12, press Enter to apply)
          </span>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Low-score threshold"
        help="Scores strictly below this count as attention-worthy. TeacherEase caps at 3 (Meeting); default 3.0 flags anything below Meeting. Lower to 2.0 if you only want clearly-below-Progressing. These knobs don't touch TeacherEase grades."
      >
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={4}
            step={0.5}
            value={thresholdInput}
            onChange={(e) => setThresholdInput(e.target.value)}
            onBlur={commitThreshold}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitThreshold();
              }
            }}
            aria-label="Low-score threshold"
            className="h-8 w-20 rounded-md border border-input bg-card px-2 text-[13px] text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <span className="text-[12px] text-muted-foreground">(0.0–4.0, press Enter to apply)</span>
        </div>
      </SettingsSection>

      <SettingsSection title="Icon reference" help="What the icons in the Classes drilldown mean.">
        <div className="space-y-2">
          {ICON_REFERENCE.map((row) => {
            const Icon = row.icon;
            return (
              <div key={row.label} className="flex items-start gap-3">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${row.className}`} />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{row.label}</p>
                  <p className="text-[12px] text-muted-foreground">{row.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </SettingsSection>
    </div>
  );
}
