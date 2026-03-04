interface SkeletonLoaderProps {
  /** Number of skeleton rows to show */
  rows?: number;
  /** Whether to show a header skeleton */
  showHeader?: boolean;
  /** Whether to show stats card skeletons */
  showStats?: boolean;
  /** Number of stat cards to simulate */
  statsCount?: number;
}

export function SkeletonLoader({
  rows = 5,
  showHeader = true,
  showStats = false,
  statsCount = 3,
}: SkeletonLoaderProps) {
  const colsMap: Record<number, string> = {
    1: "sm:grid-cols-1",
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-3",
    4: "sm:grid-cols-4",
    5: "sm:grid-cols-5",
    6: "sm:grid-cols-6",
  };
  const statsCols = colsMap[statsCount] ?? "sm:grid-cols-3";

  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      {showHeader && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between bg-white rounded-xl p-4 border border-neutral-200">
          <div className="space-y-2">
            <div className="h-6 w-48 bg-neutral-200 rounded" />
            <div className="h-4 w-64 bg-neutral-100 rounded" />
          </div>
          <div className="h-9 w-32 bg-neutral-200 rounded-lg" />
        </div>
      )}

      {/* Stats skeleton */}
      {showStats && (
        <div className={`grid grid-cols-1 ${statsCols} gap-4`}>
          {Array.from({ length: statsCount }).map((_, i) => (
            <div
              key={i}
              className="bg-white border border-neutral-200 rounded-xl p-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-neutral-200 rounded-lg" />
                <div className="space-y-1.5">
                  <div className="h-3.5 w-20 bg-neutral-100 rounded" />
                  <div className="h-6 w-12 bg-neutral-200 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table / content skeleton */}
      <div className="bg-white rounded-xl border border-neutral-200">
        {/* Search bar skeleton */}
        <div className="p-4 border-b border-neutral-200 flex items-center gap-4">
          <div className="h-9 w-64 bg-neutral-100 rounded-lg" />
          <div className="h-9 w-28 bg-neutral-100 rounded-lg" />
          <div className="h-9 w-9 bg-neutral-100 rounded-lg" />
        </div>
        {/* Rows skeleton */}
        <div className="divide-y divide-neutral-200">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="p-4 flex items-center gap-4">
              <div className="h-4 w-1/4 bg-neutral-100 rounded" />
              <div className="h-4 w-1/5 bg-neutral-100 rounded" />
              <div className="h-4 w-1/6 bg-neutral-100 rounded" />
              <div className="h-4 w-1/6 bg-neutral-100 rounded" />
              <div className="ml-auto h-8 w-20 bg-neutral-100 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
