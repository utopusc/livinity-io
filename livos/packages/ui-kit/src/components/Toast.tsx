import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "../lib/cn";
import type {
  ToastApi,
  ToastItem,
  ToastProviderProps,
  ToastTone,
} from "./Toast.types";
import "../styles/composites.css";

const ToastContext = createContext<ToastApi | null>(null);

let counter = 0;
function makeId(): string {
  return `liv-toast-${++counter}-${Date.now()}`;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({
  children,
  defaultDuration = 4000,
}) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (
      tone: ToastTone,
      message: React.ReactNode,
      options?: { duration?: number },
    ): string => {
      const id = makeId();
      const duration = options?.duration ?? defaultDuration;
      setItems((prev) => [...prev, { id, tone, message, duration }]);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [defaultDuration, dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m, o) => push("success", m, o),
      warn: (m, o) => push("warn", m, o),
      error: (m, o) => push("error", m, o),
      info: (m, o) => push("info", m, o),
      dismiss,
    }),
    [push, dismiss],
  );

  useEffect(
    () => () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
    },
    [],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="toast-region"
        role="region"
        aria-label="Notifications"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn("toast", t.tone)}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
ToastProvider.displayName = "ToastProvider";

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within <ToastProvider>");
  }
  return ctx;
}
