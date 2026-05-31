"use client";

// Applies the user's appearance preferences to <html> (Phase 14 A1 + A4 + A2).
// Renders nothing — side-effect only. Reads three per-browser preferences from
// localStorage (M06 decision: appearance is per-viewer, not shared server state):
//   - appearance.theme     (light | dark | system)      — toggles `.dark` class
//   - appearance.profile   (default | solarized | ...)  — applies `.theme-<name>` class
//   - appearance.fontSize  (stringified zoom factor)    — sets `--font-scale` CSS var
// Listens for OS color-scheme changes when theme is "system" and for the
// pref-change events emitted by writePref so the Appearance settings tab can
// trigger an immediate re-resolve without a page reload.

import { useEffect } from "react";
import { readPref } from "@/hooks/use-pref";
import {
  FONT_SIZE_DEFAULT,
  isThemePreference,
  isThemeProfile,
  PROFILE_CLASSES,
  parseFontSize,
  resolveTheme,
  type ThemePreference,
  type ThemeProfile,
} from "@/lib/core/theme";

const THEME_KEY = "appearance.theme";
const PROFILE_KEY = "appearance.profile";
const FONT_SIZE_KEY = "appearance.fontSize";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

// Event names emitted by writePref (`pref-change:<key>`). The Appearance
// settings tab persists via writePref, which dispatches these — we listen so a
// change re-resolves the theme immediately.
const PREF_EVENTS = [
  `pref-change:${THEME_KEY}`,
  `pref-change:${PROFILE_KEY}`,
  `pref-change:${FONT_SIZE_KEY}`,
];

function apply(
  preference: ThemePreference,
  profile: ThemeProfile,
  fontScale: number,
  mql: MediaQueryList | null,
): void {
  const systemPrefersDark = mql?.matches ?? false;
  const resolved = resolveTheme(preference, systemPrefersDark);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  // Remove any prior profile class, then apply the selected one (if any).
  for (const cls of Object.values(PROFILE_CLASSES)) {
    if (cls) root.classList.remove(cls);
  }
  const profileClass = PROFILE_CLASSES[profile];
  if (profileClass) root.classList.add(profileClass);
  root.style.setProperty("--font-scale", String(fontScale));
}

export function ThemeProvider() {
  useEffect(() => {
    const mql = typeof window === "undefined" ? null : window.matchMedia(MEDIA_QUERY);
    let currentPreference: ThemePreference = "system";
    let currentProfile: ThemeProfile = "default";
    let currentFontScale: number = FONT_SIZE_DEFAULT;

    const readAndApply = () => {
      const themeRaw = readPref(THEME_KEY, "system");
      const profileRaw = readPref(PROFILE_KEY, "default");
      const fontSizeRaw = readPref(FONT_SIZE_KEY, String(FONT_SIZE_DEFAULT));
      currentPreference = isThemePreference(themeRaw) ? themeRaw : "system";
      currentProfile = isThemeProfile(profileRaw) ? profileRaw : "default";
      currentFontScale = parseFontSize(fontSizeRaw);
      apply(currentPreference, currentProfile, currentFontScale, mql);
    };

    const handleSystemChange = () => {
      if (currentPreference === "system") {
        apply(currentPreference, currentProfile, currentFontScale, mql);
      }
    };

    const handlePreferenceChange = () => {
      readAndApply();
    };

    readAndApply();
    mql?.addEventListener("change", handleSystemChange);
    for (const name of PREF_EVENTS) {
      window.addEventListener(name, handlePreferenceChange);
    }

    return () => {
      mql?.removeEventListener("change", handleSystemChange);
      for (const name of PREF_EVENTS) {
        window.removeEventListener(name, handlePreferenceChange);
      }
    };
  }, []);

  return null;
}
