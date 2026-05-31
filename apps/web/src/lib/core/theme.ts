// Pure theme-resolution logic for the Appearance settings. No platform imports —
// the client-side provider reads DOM state (matchMedia) and feeds it into
// `resolveTheme` to decide whether to apply `.dark`. Ported verbatim from the
// desktop app (label strings inlined in English).

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export type ThemeProfile = "default" | "solarized" | "nord" | "dracula" | "contrast";

const PREFERENCES: ReadonlySet<string> = new Set(["light", "dark", "system"]);
const PROFILES: ReadonlySet<string> = new Set([
  "default",
  "solarized",
  "nord",
  "dracula",
  "contrast",
]);

// The "default" profile is driven by the base :root / .dark rules in
// globals.css, so no class is applied for it. Other profiles each have a
// matching `.theme-<name>` block in globals.css.
export const PROFILE_CLASSES: Readonly<Record<ThemeProfile, string | null>> = {
  default: null,
  solarized: "theme-solarized",
  nord: "theme-nord",
  dracula: "theme-dracula",
  contrast: "theme-contrast",
};

export const PROFILE_LABELS: Readonly<Record<ThemeProfile, string>> = {
  default: "Default (soft)",
  solarized: "Solarized",
  nord: "Nord",
  dracula: "Dracula",
  contrast: "High contrast",
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && PREFERENCES.has(value);
}

export function isThemeProfile(value: unknown): value is ThemeProfile {
  return typeof value === "string" && PROFILES.has(value);
}

// Zoom-factor bounds. The UI permits 50–200 % (0.5–2.0 zoom). Values outside
// the range are clamped on parse.
export const FONT_SIZE_MIN = 0.5;
export const FONT_SIZE_MAX = 2.0;
export const FONT_SIZE_DEFAULT = 1.0;

export const FONT_SIZE_PRESETS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1.0, label: "Small" },
  { value: 1.15, label: "Medium" },
  { value: 1.3, label: "Large" },
];

/**
 * Parse a stored font-size value (stringified zoom factor) into a number
 * clamped to [FONT_SIZE_MIN, FONT_SIZE_MAX]. Invalid inputs fall back to
 * FONT_SIZE_DEFAULT.
 */
export function parseFontSize(raw: unknown): number {
  if (typeof raw !== "string") return FONT_SIZE_DEFAULT;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return FONT_SIZE_DEFAULT;
  if (n < FONT_SIZE_MIN) return FONT_SIZE_MIN;
  if (n > FONT_SIZE_MAX) return FONT_SIZE_MAX;
  return n;
}

export function isScaleNear(a: number, b: number, epsilon = 0.001): boolean {
  return Math.abs(a - b) < epsilon;
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}
