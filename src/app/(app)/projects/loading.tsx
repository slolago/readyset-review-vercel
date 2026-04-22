import { Skeleton } from '@/components/ui/Skeleton';

export default function ProjectsLoading() {
  return (
    <div className="min-h-full">
      {/* Header skeleton mirrors the real /projects header */}
      <div className="border-b border-frame-border bg-frame-sidebar">
        <div className="px-8 py-6 max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <Skeleton className="h-6 w-32 mb-2" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
      <div className="p-8 max-w-7xl mx-auto">
        <Skeleton className="h-10 w-64 mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 border border-frame-border" />
          ))}
        </div>
      </div>
    </div>
  );
}
