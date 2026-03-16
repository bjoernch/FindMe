export function MapSkeleton() {
  return (
    <div className="w-full h-full bg-card animate-pulse flex items-center justify-center">
      <div className="text-dim text-lg">Loading map...</div>
    </div>
  );
}

export function DeviceListSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-input rounded-lg p-3 animate-pulse">
          <div className="h-4 bg-hover rounded w-3/4 mb-2" />
          <div className="h-3 bg-hover rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-input rounded-lg p-4 animate-pulse">
          <div className="flex gap-4">
            <div className="h-4 bg-hover rounded w-1/4" />
            <div className="h-4 bg-hover rounded w-1/6" />
            <div className="h-4 bg-hover rounded w-1/3" />
            <div className="h-4 bg-hover rounded w-1/6" />
          </div>
        </div>
      ))}
    </div>
  );
}
