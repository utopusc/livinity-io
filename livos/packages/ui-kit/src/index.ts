// @livinity/ui-kit — entry point.
// Components added by Phase 119-02 (atoms) and 119-03 (composites).
export const __ui_kit_version__ = "0.1.0";

// ============================================================
// Atoms (Phase 119-02)
// ============================================================

export { Button } from "./components/Button";
export type {
  ButtonProps,
  ButtonVariant,
  ButtonSize,
} from "./components/Button.types";

export { Card } from "./components/Card";
export type {
  CardProps,
  CardPadding,
  CardRadius,
} from "./components/Card.types";

export { Pill } from "./components/Pill";
export type { PillProps, PillTone } from "./components/Pill.types";

export { Input } from "./components/Input";
export type { InputProps } from "./components/Input.types";

export { PasswordInput } from "./components/PasswordInput";

// ============================================================
// Shared utilities + theme helpers
// ============================================================

export { cn } from "./lib/cn";

export {
  LIV_THEME_STORAGE_KEY,
  LIV_THEMES,
  applyLivTheme,
  readLivTheme,
} from "./lib/theme-classes";
export type { LivTheme } from "./lib/theme-classes";
