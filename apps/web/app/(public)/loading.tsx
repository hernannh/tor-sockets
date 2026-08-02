import { Skeleton } from '@/components/ui/skeleton';

/**
 * Shared loading shape for the public pages. They all open with a title block
 * and a row of tiles over a wide panel, so one skeleton stands in for every
 * route without pretending to know the exact layout underneath.
 */
export default function PublicLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>

      <Skeleton className="h-72" />
    </div>
  );
}
