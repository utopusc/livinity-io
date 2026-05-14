import React, { useEffect, useState } from "react";
import {
  applyLivTheme,
  readLivTheme,
  LIV_THEME_STORAGE_KEY,
  type LivTheme,
} from "../lib/theme-classes";
import { cn } from "../lib/cn";
import "../styles/composites.css";

const NEXT: Record<LivTheme, LivTheme> = {
  light: "dark",
  dark: "iridescent",
  iridescent: "light",
};

const LABEL: Record<LivTheme, string> = {
  light: "Switch to dark theme",
  dark: "Switch to iridescent theme",
  iridescent: "Switch to light theme",
};

const GLYPH: Record<LivTheme, string> = {
  light: "☀",
  dark: "☾",
  iridescent: "✦",
};

export interface ThemeToggleProps {
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className }) => {
  const [theme, setTheme] = useState<LivTheme>("light");

  useEffect(() => {
    const initial = readLivTheme();
    setTheme(initial);
    applyLivTheme(initial);
  }, []);

  function cycle() {
    const next = NEXT[theme];
    setTheme(next);
    applyLivTheme(next);
    try {
      window.localStorage.setItem(LIV_THEME_STORAGE_KEY, next);
    } catch {
      /* private mode — fail silent */
    }
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={LABEL[theme]}
      className={cn("theme-toggle", className)}
    >
      <span aria-hidden="true">{GLYPH[theme]}</span>
    </button>
  );
};
ThemeToggle.displayName = "ThemeToggle";
