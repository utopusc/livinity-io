import React, { forwardRef, useId } from "react";
import { cn } from "../lib/cn";
import type { InputProps } from "./Input.types";
import "../styles/atoms.css";

/**
 * Input — canonical `.i-text` per Phase 119-02 (F-115-MAP-04 introduces the
 * shared LivOS input class). Wraps an <input> with optional label / hint /
 * error in an i-text-wrap container.
 *
 * A11y contract (D-119-A11Y-FOCUS-RINGS):
 * - Label is associated via htmlFor + input id (auto-generated with useId
 *   when no id prop is supplied).
 * - hint -> aria-describedby points to the .i-text-hint <p>.
 * - error -> aria-describedby points to the .i-text-error <p>,
 *            aria-invalid="true" on input, role="alert" on the error node.
 * - :focus-visible ring is defined in atoms.css.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    id,
    label,
    hint,
    error,
    className,
    "aria-describedby": ariaDescribedByProp,
    ...rest
  },
  ref
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  // Precedence: error message > hint > caller-supplied aria-describedby.
  const describedBy = errorId ?? hintId ?? ariaDescribedByProp;

  return (
    <div className={cn("i-text-wrap", className)}>
      {label != null && (
        <label htmlFor={inputId} className="i-text-label">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className="i-text"
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      {error ? (
        <p id={errorId} className="i-text-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="i-text-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

Input.displayName = "Input";
