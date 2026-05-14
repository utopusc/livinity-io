import type { ReactNode } from "react";

export type ToastTone = "success" | "warn" | "error" | "info";

export interface ToastItem {
  id: string;
  tone: ToastTone;
  message: ReactNode;
  duration?: number;
}

export interface ToastApi {
  success: (message: ReactNode, options?: { duration?: number }) => string;
  warn: (message: ReactNode, options?: { duration?: number }) => string;
  error: (message: ReactNode, options?: { duration?: number }) => string;
  info: (message: ReactNode, options?: { duration?: number }) => string;
  dismiss: (id: string) => void;
}

export interface ToastProviderProps {
  children: ReactNode;
  defaultDuration?: number;
}
