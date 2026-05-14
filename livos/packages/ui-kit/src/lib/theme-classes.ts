/**
 * Canonical body-class names for the three LivOS themes.
 * Source: @livinity/design-tokens DESIGN-SYSTEM.md § Interaction Patterns.
 */
export const LIV_THEME_STORAGE_KEY = "liv_theme";
export type LivTheme = "light" | "dark" | "iridescent";

export const LIV_THEMES: readonly LivTheme[] = ["light", "dark", "iridescent"] as const;

export function applyLivTheme(theme: LivTheme, body: HTMLElement = document.body): void {
  body.classList.toggle("dark", theme === "dark");
  body.classList.toggle("iridescent", theme === "iridescent");
}

export function readLivTheme(): LivTheme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(LIV_THEME_STORAGE_KEY) as LivTheme | null;
  if (stored === "light" || stored === "dark" || stored === "iridescent") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
