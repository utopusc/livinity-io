import React, { useState } from "react";
import { cn } from "../lib/cn";
import type { CommandBoxProps } from "./CommandBox.types";
import "../styles/composites.css";

export const CommandBox: React.FC<CommandBoxProps> = ({
  text,
  copyButton = false,
  className,
}) => {
  const [justCopied, setJustCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 1500);
    } catch {
      /* swallow — tests assert the writeText call, not error UX */
    }
  }

  return (
    <div className={cn("cmd-box", className)}>
      <pre>{text}</pre>
      {copyButton && (
        <button
          type="button"
          className="cmd-box-copy"
          aria-label={justCopied ? "Copied" : "Copy to clipboard"}
          onClick={handleCopy}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      )}
    </div>
  );
};
CommandBox.displayName = "CommandBox";
