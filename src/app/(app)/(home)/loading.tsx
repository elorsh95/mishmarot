import { HeaderSkeleton, LoadingLabel, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <LoadingLabel />
      <HeaderSkeleton />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4"
          >
            <Skeleton className="h-11 w-11 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-10" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border bg-surface p-4">
            <Skeleton className="h-4 w-24" />
            <div className="grid grid-cols-6 gap-1">
              {[0, 1, 2, 3, 4, 5].map((d) => (
                <Skeleton key={d} className="h-14" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
