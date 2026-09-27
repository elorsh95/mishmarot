/** Reports a browser-side error to the server log (see app/client-error). Client-safe. */

let sent = 0;
/** A page that keeps failing reports only its first few errors. */
const MAX_PER_PAGE = 5;

export function sendClientError(
  error: unknown,
  extra: { source: string; digest?: string } = { source: "browser" },
) {
  try {
    if (sent >= MAX_PER_PAGE) return;
    sent += 1;
    const err = error instanceof Error ? error : new Error(String(error));
    const body = JSON.stringify({
      message: err.message,
      stack: err.stack ?? "",
      digest: extra.digest,
      source: extra.source,
      url: window.location.pathname + window.location.search,
    });
    const blob = new Blob([body], { type: "application/json" });
    // sendBeacon survives navigation; fetch is the fallback.
    if (!navigator.sendBeacon?.("/client-error", blob)) {
      void fetch("/client-error", { method: "POST", body, keepalive: true });
    }
  } catch {
    // Reporting must never break the page.
  }
}
