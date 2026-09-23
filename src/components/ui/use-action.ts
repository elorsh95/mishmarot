"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action";
import { useToast } from "./toast";

/**
 * Calls a server action, tracks pending state and field errors, and shows a toast.
 * Returns the data on success, or undefined on failure.
 */
export function useAction() {
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  function run<T>(
    action: () => Promise<ActionResult<T>>,
    opts: { success?: string; onSuccess?: (data: T) => void } = {},
  ) {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        const message = result.message ?? opts.success;
        if (message) toast.success(message);
        opts.onSuccess?.(result.data);
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(result.error);
      }
    });
  }

  function reset() {
    setError(null);
    setFieldErrors({});
  }

  return { run, pending, error, fieldErrors, reset };
}
