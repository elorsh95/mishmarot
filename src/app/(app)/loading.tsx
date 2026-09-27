import { HeaderSkeleton, LoadingLabel, TableSkeleton } from "@/components/ui/skeleton";

/** Default loading state for pages without their own. */
export default function Loading() {
  return (
    <div>
      <LoadingLabel />
      <HeaderSkeleton />
      <TableSkeleton />
    </div>
  );
}
