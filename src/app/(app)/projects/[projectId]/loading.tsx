import { Skeleton } from '@/components/ui/Skeleton';

export default function ProjectRootLoading() {
  return (
    <div className="flex flex-col h-full">
      {/* Tab bar skeleton */}
      <div className="flex items-center gap-2 px-8 pt-3 border-b border-frame-border bg-frame-sidebar">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-28" />
      </div>
      {/* Breadcrumb + content skeleton */}
      <div className="p-6">
        <Skeleton className="h-4 w-48 mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video" />
          ))}
        </div>
      </div>
    </div>
  );
}
