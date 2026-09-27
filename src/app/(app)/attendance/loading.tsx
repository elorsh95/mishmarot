import { LoadingLabel, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <LoadingLabel />
      <Skeleton className="h-8 w-40" />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
