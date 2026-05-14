import type { HTMLAttributes, ReactNode } from "react";

export type CardPadding = "default" | "tight";
export type CardRadius = "default" | "tight";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
  radius?: CardRadius;
  children?: ReactNode;
}
