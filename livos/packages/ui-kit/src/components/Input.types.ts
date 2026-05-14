import type { InputHTMLAttributes, ReactNode } from "react";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** Visible label associated to the input via htmlFor. */
  label?: ReactNode;
  /** Helper hint shown below the input; linked via aria-describedby. */
  hint?: ReactNode;
  /**
   * Validation error message. When set, replaces the hint in aria-describedby,
   * sets aria-invalid="true" on the input, and renders with role="alert".
   */
  error?: ReactNode;
}
