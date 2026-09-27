import { cn } from "@/lib/cn";

/** A grey placeholder block shown while a page loads (see the loading.tsx files). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-border/70", className)} />;
}

/** The page title and its description line. */
export function HeaderSkeleton() {
  return (
    <div className="mb-5 space-y-2">
      <Skeleton className="h-7 w-44" />
      <Skeleton className="h-4 w-72 max-w-full" />
    </div>
  );
}

/** A card holding a table: a header row and `rows` lines. */
export function TableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex gap-4 border-b border-border bg-muted/60 px-4 py-3">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className={cn("h-3", i === 0 ? "w-32" : "w-16")} />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: columns }, (_, i) => (
              <Skeleton key={i} className={cn("h-4", i === 0 ? "w-32" : "w-16")} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Screen-reader text for a loading page. */
export function LoadingLabel() {
  return (
    <span role="status" className="sr-only">
      טוען…
    </span>
  );
}
