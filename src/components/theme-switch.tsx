"use client";

import { useState } from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { THEME_COOKIE, type Theme } from "./theme";

/** [theme, button label, tooltip, icon] */
const OPTIONS: Array<[Theme, string, string, LucideIcon]> = [
  ["system", "מערכת", "לפי הגדרת המכשיר", Monitor],
  ["light", "בהיר", "מצב בהיר", Sun],
  ["dark", "כהה", "מצב כהה", Moon],
];

/** Applies a theme at once and remembers it for a year (the root layout reads the cookie). */
function applyTheme(theme: Theme) {
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}

/** Light / dark / the device's setting. */
export function ThemeSwitch({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  return (
    <div role="radiogroup" aria-label="ערכת צבעים" className="flex rounded-lg bg-muted p-0.5">
      {OPTIONS.map(([key, label, hint, Icon]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={theme === key}
          title={hint}
          onClick={() => {
            setTheme(key);
            applyTheme(key);
          }}
          className={cn(
            "flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-xs",
            theme === key ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
