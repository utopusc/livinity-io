import type { HTMLAttributes, ReactNode } from "react";

export type PillTone = "ok" | "warn" | "err" | "neutral";

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
  children?: ReactNode;
}
