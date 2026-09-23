"use client";

import { useEffect } from "react";
import { ArrowRight, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Screen-only toolbar. Opens the print dialog once fonts are ready. */
export function PrintToolbar() {
  useEffect(() => {
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) setTimeout(() => window.print(), 300);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function closeOrBack() {
    window.close();
    // close() is ignored when the tab wasn't opened by the app
    setTimeout(() => window.history.back(), 100);
  }

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-4 py-2 print:hidden">
      <p className="text-sm text-fg-muted">
        בחלון ההדפסה בחרו <strong>״שמירה כ-PDF״</strong> כיעד (בטלפון: שיתוף ← הדפסה ← שמירה כ-PDF)
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={closeOrBack}>
          <ArrowRight className="h-4 w-4" />
          סגירה
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          הדפסה / שמירה כ-PDF
        </Button>
      </div>
    </div>
  );
}
