import { Skeleton } from '@/components/ui/Skeleton';

export default function FolderLoading() {
  return (
    <div className="p-6">
      {/* Breadcrumb skeleton */}
      <Skeleton className="h-4 w-64 mb-6" />
      {/* Folder content skeleton — mirror of FolderBrowser grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-video" />
        ))}
      </div>
    </div>
  );
}
