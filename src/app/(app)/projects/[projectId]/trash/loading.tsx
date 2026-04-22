import { Skeleton } from '@/components/ui/Skeleton';

export default function TrashLoading() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-28" />
      </div>
      {/* Section heading + row list */}
      <Skeleton className="h-5 w-20 mb-2" />
      <div className="border border-white/10 rounded divide-y divide-white/10">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-2 px-3">
            <div className="flex-1 min-w-0 pr-3">
              <Skeleton className="h-4 w-48 mb-1" />
              <Skeleton className="h-3 w-32" />
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-7 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
