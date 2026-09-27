"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastTone = "success" | "error" | "info";
export interface ToastOptions {
  /** A button in the toast, e.g. "ביטול" to undo what was just done. */
  action?: { label: string; onClick: () => void };
}
interface ToastItem extends ToastOptions {
  id: number;
  tone: ToastTone;
  message: string;
}

type Push = (tone: ToastTone, message: string, options?: ToastOptions) => void;
const ToastContext = createContext<Push>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback(
    (id: number) => setItems((list) => list.filter((t) => t.id !== id)),
    [],
  );
  const push = useCallback<Push>(
    (tone, message, options = {}) => {
      const id = Date.now() + Math.random();
      setItems((list) => [...list.slice(-3), { id, tone, message, ...options }]);
      // A toast with a button stays longer, so there is time to use it.
      setTimeout(() => dismiss(id), options.action ? 12000 : tone === "error" ? 7000 : 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {items.map((t) => {
          const Icon =
            t.tone === "success" ? CheckCircle2 : t.tone === "error" ? AlertCircle : Info;
          return (
            <div
              key={t.id}
              className={cn(
                "pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg",
                t.tone === "success" && "border-success/30 bg-surface text-fg",
                t.tone === "error" && "border-danger/30 bg-surface text-fg",
                t.tone === "info" && "border-border bg-surface text-fg",
              )}
            >
              <Icon
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  t.tone === "success" && "text-success",
                  t.tone === "error" && "text-danger",
                  t.tone === "info" && "text-primary",
                )}
              />
              <span className="flex-1 whitespace-pre-line">{t.message}</span>
              {t.action ? (
                <button
                  type="button"
                  onClick={() => {
                    dismiss(t.id);
                    t.action!.onClick();
                  }}
                  className="-my-1 shrink-0 rounded-md px-2 py-1 text-sm font-semibold text-primary hover:bg-primary/10"
                >
                  {t.action.label}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="text-fg-muted hover:text-fg"
                aria-label="סגירה"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastContext);
  return {
    success: (m: string, o?: ToastOptions) => push("success", m, o),
    error: (m: string, o?: ToastOptions) => push("error", m, o),
    info: (m: string, o?: ToastOptions) => push("info", m, o),
  };
}
