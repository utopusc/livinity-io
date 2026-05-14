import React, { forwardRef } from "react";
import { cn } from "../lib/cn";
import type { StepperProps } from "./Stepper.types";
import "../styles/composites.css";

export const Stepper = forwardRef<HTMLOListElement, StepperProps>(
  ({ steps, current, className }, ref) => (
    <ol
      ref={ref}
      role="list"
      aria-label="Progress"
      className={cn("stepper", className)}
    >
      {steps.map((step, i) => {
        const state =
          i < current ? "done" : i === current ? "active" : undefined;
        return (
          <li
            key={step.id ?? `${i}-${step.label}`}
            role="listitem"
            aria-current={state === "active" ? "step" : undefined}
            className={cn("step", state)}
          >
            {state === "done" && (
              <span aria-hidden="true" data-testid="stepper-check">
                ✓
              </span>
            )}
            {step.label}
          </li>
        );
      })}
    </ol>
  ),
);
Stepper.displayName = "Stepper";
