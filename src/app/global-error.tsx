"use client";

import { useEffect } from "react";
import { sendClientError } from "@/lib/client-error";

/**
 * Last resort, when the root layout itself fails. It replaces the whole document, so it carries
 * its own minimal styling (the app's stylesheet and theme aren't loaded here).
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    if (!error.digest) sendClientError(error, { source: "global-error" });
  }, [error]);

  return (
    <html lang="he" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, Arial, sans-serif",
          background: "#f5f6fa",
          color: "#1b2230",
          textAlign: "center",
          padding: 16,
        }}
      >
        <title>משהו השתבש · משמרות</title>
        <div>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>משהו השתבש</h1>
          <p style={{ color: "#5d6677", margin: "0 0 16px" }}>
            התקלה נרשמה ותטופל. נסו שוב בעוד רגע.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              background: "#3b5bdb",
              color: "#fff",
              border: 0,
              borderRadius: 8,
              padding: "10px 18px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            נסו שוב
          </button>
          {error.digest ? (
            <p style={{ marginTop: 16, fontSize: 12, color: "#98a0ae" }} dir="ltr">
              קוד תקלה: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
