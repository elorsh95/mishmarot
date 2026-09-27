import { LoadingLabel, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <LoadingLabel />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-10 w-36" />
        </div>
        <Skeleton className="h-10 w-56" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="grid grid-cols-7 gap-2 border-b border-border p-3">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </div>
        {Array.from({ length: 7 }, (_, r) => (
          <div key={r} className="grid grid-cols-7 gap-2 border-b border-border p-3 last:border-0">
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} className={i === 0 ? "h-10" : "h-10 rounded-lg"} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
