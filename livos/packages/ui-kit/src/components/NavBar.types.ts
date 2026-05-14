import type { ReactNode } from "react";

export interface NavBarProps {
  brand: ReactNode;
  actions?: ReactNode;
  className?: string;
  as?: "header" | "nav";
}
