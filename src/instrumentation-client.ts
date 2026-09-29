import { sendClientError } from "@/lib/client-error";

/** Errors nobody caught in the browser are reported to the server log. */
const IGNORED = [
  // Harmless browser noise
  /ResizeObserver loop/,
  // Old tabs after a deploy (the page reloads on the next navigation)
  /Loading chunk .* failed|Failed to fetch dynamically imported module/,
  // Next.js navigation signals (redirect(), notFound()), not errors
  /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/,
];

function ignored(message: string) {
  return IGNORED.some((re) => re.test(message));
}

window.addEventListener("error", (event) => {
  const message = event.error?.message ?? event.message ?? "";
  // Errors from browser extensions and other sites' scripts have no file of ours.
  if (!event.filename?.startsWith(window.location.origin) || ignored(message)) return;
  sendClientError(event.error ?? message, { source: "window.error" });
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason ?? "");
  if (ignored(message)) return;
  sendClientError(reason, { source: "unhandledrejection" });
});
