import React, { forwardRef } from "react";
import { cn } from "../lib/cn";
import type { CardProps } from "./Card.types";
import "../styles/atoms.css";

/**
 * Card — canonical `.b-card` per dashboard.html.
 *
 * - padding: "default" (28px = var(--dash-pad)) | "tight" (16px).
 * - radius:  "default" (18px = var(--dash-radius)) | "tight" (12px).
 * - Forwards ref to the underlying <div>.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding = "default", radius = "default", className, children, ...rest },
  ref
) {
  const padClass =
    padding === "tight" ? "b-card-pad-tight" : "b-card-pad-default";
  const radiusClass =
    radius === "tight" ? "b-card-radius-tight" : "b-card-radius-default";

  return (
    <div
      ref={ref}
      className={cn("b-card", padClass, radiusClass, className)}
      {...rest}
    >
      {children}
    </div>
  );
});

Card.displayName = "Card";
