import React, { forwardRef } from "react";
import { cn } from "../lib/cn";
import type { PillProps } from "./Pill.types";
import "../styles/atoms.css";

/**
 * Pill — canonical `.pill` per dashboard.html.
 *
 * Tones: ok | warn | err | neutral (default).
 * Uses Geist Mono via atoms.css; the visual tone is keyed off
 * var(--accent-{green,amber,red}) + color-mix() tinted backgrounds.
 */
export const Pill = forwardRef<HTMLSpanElement, PillProps>(function Pill(
  { tone = "neutral", className, children, ...rest },
  ref
) {
  return (
    <span ref={ref} className={cn("pill", tone, className)} {...rest}>
      {children}
    </span>
  );
});

Pill.displayName = "Pill";
