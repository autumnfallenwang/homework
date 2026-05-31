"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { SettingsSection } from "@/components/settings/section";
import { readPref, writePref } from "@/hooks/use-pref";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_PRESETS,
  isScaleNear,
  isThemePreference,
  isThemeProfile,
  PROFILE_LABELS,
  parseFontSize,
  type ThemePreference,
  type ThemeProfile,
} from "@/lib/core/theme";

const THEME_KEY = "appearance.theme";
const PROFILE_KEY = "appearance.profile";
const FONT_SIZE_KEY = "appearance.fontSize";

const MODE_OPTIONS: Array<{ value: ThemePreference; label: string; icon: ReactNode }> = [
  { value: "light", label: "Light", icon: <Sun className="h-3.5 w-3.5" /> },
  { value: "dark", label: "Dark", icon: <Moon className="h-3.5 w-3.5" /> },
  { value: "system", label: "System", icon: <Monitor className="h-3.5 w-3.5" /> },
];

const PROFILE_ORDER: ThemeProfile[] = ["default", "solarized", "nord", "dracula", "contrast"];

const PROFILE_DESCRIPTIONS: Record<ThemeProfile, string> = {
  default: "Warm off-white + warm slate. The app's house palette.",
  solarized: "Ethan Schoonover's classic warm-ochre and cyan.",
  nord: "Cool Arctic blue-gray. Calm and modern.",
  dracula: "Purple / pink / cyan on dark. Dark-first classic.",
  contrast: "WCAG AAA. Maximum contrast for accessibility.",
};

// Switch presets — keyed by preset.value, mapped to English labels since the
// shared presets only carry a generic label.
const SIZE_PRESET_LABELS: Record<string, string> = {
  Small: "Small",
  Medium: "Medium",
  Large: "Large",
};

function scaleToPercent(scale: number): number {
  return Math.round(scale * 100);
}

// After persisting an appearance pref, nudge the ThemeProvider to re-resolve.
// `writePref` already dispatches `pref-change:<key>`; we also fire the legacy
// `theme-preference-change` event and a generic `appearance-change` so the
// provider picks the change up regardless of which it listens for.
function notifyAppearanceChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("theme-preference-change"));
  window.dispatchEvent(new Event("appearance-change"));
}

export function SettingsAppearance() {
  const [mode, setMode] = useState<ThemePreference>("system");
  const [profile, setProfile] = useState<ThemeProfile>("default");
  const [scale, setScale] = useState<number>(FONT_SIZE_DEFAULT);
  // Separate draft state so intermediate typing in the custom input doesn't
  // trigger saves (per Q24: text inputs commit on Enter or blur).
  const [percentInput, setPercentInput] = useState<string>(
    String(scaleToPercent(FONT_SIZE_DEFAULT)),
  );

  useEffect(() => {
    const rawTheme = readPref(THEME_KEY, "system");
    const rawProfile = readPref(PROFILE_KEY, "default");
    const rawSize = readPref(FONT_SIZE_KEY, String(FONT_SIZE_DEFAULT));
    setMode(isThemePreference(rawTheme) ? rawTheme : "system");
    setProfile(isThemeProfile(rawProfile) ? rawProfile : "default");
    const parsed = parseFontSize(rawSize);
    setScale(parsed);
    setPercentInput(String(scaleToPercent(parsed)));
  }, []);

  const handleMode = (value: ThemePreference) => {
    if (value === mode) return;
    setMode(value);
    writePref(THEME_KEY, value);
    notifyAppearanceChanged();
  };

  const handleProfile = (value: string) => {
    if (!isThemeProfile(value) || value === profile) return;
    setProfile(value);
    writePref(PROFILE_KEY, value);
    notifyAppearanceChanged();
  };

  const applyScale = (next: number) => {
    if (isScaleNear(next, scale)) return;
    setScale(next);
    setPercentInput(String(scaleToPercent(next)));
    writePref(FONT_SIZE_KEY, String(next));
    notifyAppearanceChanged();
  };

  const commitPercentInput = () => {
    const pct = Number.parseFloat(percentInput);
    if (!Number.isFinite(pct)) {
      // Revert the displayed value back to the current saved scale.
      setPercentInput(String(scaleToPercent(scale)));
      return;
    }
    const next = parseFontSize(String(pct / 100));
    applyScale(next);
  };

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Profile"
        help="Five curated palettes with light + dark variants. Pick the one that matches your eye; descriptions below preview each."
        card={false}
      >
        <div className="divide-y divide-border rounded-lg border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {PROFILE_ORDER.map((p) => {
            const active = p === profile;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={active}
                onClick={() => handleProfile(p)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors first:rounded-t-lg last:rounded-b-lg ${
                  active ? "bg-secondary text-foreground" : "text-foreground hover:bg-secondary/50"
                }`}
              >
                <span
                  className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                    active ? "bg-primary" : "bg-border"
                  }`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13px] ${active ? "font-medium" : ""}`}>
                    {PROFILE_LABELS[p]}
                  </span>
                  <span className="block text-[12px] text-muted-foreground">
                    {PROFILE_DESCRIPTIONS[p]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Mode"
        help="System follows your operating system's light/dark preference live. Light and Dark lock the app to that mode regardless of the OS."
        card={false}
      >
        <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {MODE_OPTIONS.map((opt) => {
            const active = mode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                aria-label={opt.label}
                onClick={() => handleMode(opt.value)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                  active
                    ? "bg-secondary font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Size"
        help="Scales everything — text, icons, spacing, borders — proportionally. Pick a preset or type a custom percentage."
        card={false}
      >
        <div className="space-y-3 rounded-lg border border-border bg-card px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="inline-flex rounded-lg border border-border bg-card p-1">
            {FONT_SIZE_PRESETS.map((preset) => {
              const active = isScaleNear(scale, preset.value);
              const label = SIZE_PRESET_LABELS[preset.label] ?? preset.label;
              return (
                <button
                  key={preset.label}
                  type="button"
                  aria-pressed={active}
                  aria-label={label}
                  onClick={() => applyScale(preset.value)}
                  className={`inline-flex items-center rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                    active
                      ? "bg-secondary font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="font-size-custom" className="text-[12px] text-muted-foreground">
              Custom
            </label>
            <input
              id="font-size-custom"
              type="number"
              min={Math.round(FONT_SIZE_MIN * 100)}
              max={Math.round(FONT_SIZE_MAX * 100)}
              step={5}
              value={percentInput}
              onChange={(e) => setPercentInput(e.target.value)}
              onBlur={commitPercentInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitPercentInput();
                }
              }}
              className="h-8 w-20 rounded-md border border-input bg-card px-2 text-[13px] text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <span className="text-[12px] text-muted-foreground">% (press Enter to apply)</span>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
