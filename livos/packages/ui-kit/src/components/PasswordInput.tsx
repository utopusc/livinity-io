import React, { forwardRef, useState } from "react";
import { Input } from "./Input";
import type { InputProps } from "./Input.types";
import "../styles/atoms.css";

/**
 * PasswordInput — Input + visibility toggle.
 *
 * Defaults to type="password" and renders a <button type="button"> with
 * eye / eye-off inline SVG. Clicking flips the input type AND the toggle's
 * aria-pressed AND aria-label between "Show password" and "Hide password".
 *
 * Reuses Input internally so all Input behaviors (label / hint / error /
 * disabled / aria-describedby) carry through verbatim. No duplicated logic.
 */
export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(
  function PasswordInput(props, ref) {
    const [visible, setVisible] = useState(false);

    return (
      <div className="i-text-password-wrap">
        <Input ref={ref} {...props} type={visible ? "text" : "password"} />
        <button
          type="button"
          className="i-text-toggle"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? (
            // eye-off icon
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M2 2l12 12" />
              <path d="M6.7 6.7a2 2 0 0 0 2.6 2.6" />
              <path d="M9.9 4.2A6.4 6.4 0 0 1 14.5 8a6.5 6.5 0 0 1-2.1 2.6" />
              <path d="M3.6 5.4A6.5 6.5 0 0 0 1.5 8a6.5 6.5 0 0 0 8.1 3.4" />
            </svg>
          ) : (
            // eye icon
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M1.5 8s2.5-4.5 6.5-4.5 6.5 4.5 6.5 4.5-2.5 4.5-6.5 4.5S1.5 8 1.5 8z" />
              <circle cx="8" cy="8" r="2" />
            </svg>
          )}
        </button>
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";
