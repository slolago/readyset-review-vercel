import { Skeleton } from '@/components/ui/Skeleton';

export default function AdminLoading() {
  return (
    <div className="min-h-full">
      {/* Header skeleton */}
      <div className="border-b border-frame-border bg-frame-sidebar">
        <div className="px-8 py-6 max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="w-9 h-9 rounded-xl" />
            <div>
              <Skeleton className="h-6 w-32 mb-2" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <Skeleton className="h-10 w-28" />
        </div>
      </div>
      <div className="p-8 max-w-5xl mx-auto">
        {/* Stats row */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 border border-frame-border" />
          ))}
        </div>
        {/* Tab bar skeleton */}
        <div className="flex gap-3 border-b border-frame-border mb-6 pb-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-28" />
          ))}
        </div>
        {/* Table skeleton */}
        <div className="bg-frame-card border border-frame-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-frame-border">
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="divide-y divide-frame-border">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="px-6 py-3 flex items-center gap-4">
                <Skeleton className="w-8 h-8 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
