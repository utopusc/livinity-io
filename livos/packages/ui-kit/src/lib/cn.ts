import clsx, { type ClassValue } from "clsx";

/**
 * Tiny class-name merger. Wraps clsx so consumers (and ui-kit components)
 * have a single import path: `import { cn } from "../lib/cn"`.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
