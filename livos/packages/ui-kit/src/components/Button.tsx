import React, { forwardRef, type MouseEvent } from "react";
import { cn } from "../lib/cn";
import type { ButtonProps } from "./Button.types";
import "../styles/atoms.css";

/**
 * Button — canonical `.h-btn` per dashboard.html.
 *
 * Variants: solid | ghost (default) | danger.
 * Sizes:    sm | md (default) | lg.
 *
 * - loading=true sets aria-busy="true", prepends a spinner, and blocks clicks.
 * - Forwards ref to the underlying <button>.
 * - Focus ring: `:focus-visible` outline from atoms.css (D-119-A11Y-FOCUS-RINGS).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "solid",
    size = "md",
    loading = false,
    disabled,
    className,
    children,
    onClick,
    type,
    ...rest
  },
  ref
) {
  const variantClass =
    variant === "solid" ? "solid" : variant === "danger" ? "danger" : null;
  const sizeClass =
    size === "sm" ? "h-btn-sm" : size === "lg" ? "h-btn-lg" : "h-btn-md";

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (loading || disabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onClick?.(event);
  };

  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={cn("h-btn", variantClass, sizeClass, className)}
      disabled={disabled || loading}
      aria-busy={loading ? "true" : undefined}
      onClick={handleClick}
      {...rest}
    >
      {loading ? (
        <span className="h-btn-spinner" aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
});

Button.displayName = "Button";
