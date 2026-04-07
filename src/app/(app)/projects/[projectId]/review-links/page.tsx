'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Link as LinkIcon, LayoutGrid, LayoutList } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import type { ReviewLink } from '@/types';

function ReviewLinkCard({ link, projectId }: { link: ReviewLink; projectId: string }) {
  const router = useRouter();
  const date =
    typeof link.createdAt?.toDate === 'function'
      ? link.createdAt.toDate()
      : new Date((link.createdAt as any)?._seconds * 1000 || Date.now());

  return (
    <div
      onClick={() => router.push(`/projects/${projectId}/review-links/${link.token}`)}
      className="bg-frame-card border border-frame-border rounded-xl p-4 cursor-pointer hover:bg-frame-cardHover transition-colors flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <LinkIcon className="w-4 h-4 text-frame-accent flex-shrink-0" />
        <span className="text-sm font-medium text-white truncate">{link.name}</span>
      </div>
      <div className="text-xs text-frame-textMuted">
        {link.folderId ? 'Folder share' : 'Project share'}
      </div>
      <div className="text-xs text-frame-textMuted">
        {date.toLocaleDateString()}
      </div>
    </div>
  );
}

export default function ReviewLinksListPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const router = useRouter();
  const { getIdToken } = useAuth();

  const viewModeKey = 'view-mode-rl-list';
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    if (typeof window === 'undefined') return 'list';
    return (localStorage.getItem(viewModeKey) as 'grid' | 'list') ?? 'list';
  });

  const [links, setLinks] = useState<ReviewLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    localStorage.setItem(viewModeKey, viewMode);
  }, [viewMode]);

  useEffect(() => {
    const fetchLinks = async () => {
      try {
        setLoading(true);
        const token = await getIdToken();
        const res = await fetch(`/api/review-links?projectId=${projectId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setLinks(data.links ?? []);
      } catch {
        // silently fail — empty state will show
      } finally {
        setLoading(false);
      }
    };
    fetchLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 py-4 border-b border-frame-border flex items-center justify-between gap-4">
        <nav className="flex items-center gap-1 text-sm">
          <span className="text-white font-medium">Review Links</span>
        </nav>

        {/* View mode toggle */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode('grid')}
            title="Grid view"
            className={cn(
              'p-1.5 rounded transition-colors',
              viewMode === 'grid'
                ? 'text-white bg-frame-border'
                : 'text-frame-textMuted hover:text-white'
            )}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            title="List view"
            className={cn(
              'p-1.5 rounded transition-colors',
              viewMode === 'list'
                ? 'text-white bg-frame-border'
                : 'text-frame-textMuted hover:text-white'
            )}
          >
            <LayoutList className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : links.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <LinkIcon className="w-10 h-10 text-frame-textMuted" />
            <p className="text-white font-medium text-sm">No review links yet</p>
            <p className="text-frame-textMuted text-xs text-center max-w-xs">
              Create one from the Share button or a folder menu
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {links.map((link) => (
              <ReviewLinkCard key={link.id} link={link} projectId={projectId} />
            ))}
          </div>
        ) : (
          /* List mode */
          <div className="w-full">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_140px_140px] gap-4 px-3 py-2 border-b border-frame-border text-xs font-semibold text-frame-textMuted uppercase tracking-wider">
              <span>Name</span>
              <span>Scope</span>
              <span>Created</span>
            </div>
            {links.map((link) => {
              const date =
                typeof link.createdAt?.toDate === 'function'
                  ? link.createdAt.toDate()
                  : new Date((link.createdAt as any)?._seconds * 1000 || Date.now());

              return (
                <div
                  key={link.id}
                  onClick={() => router.push(`/projects/${projectId}/review-links/${link.token}`)}
                  className="grid grid-cols-[1fr_140px_140px] gap-4 px-3 py-3 border-b border-frame-border hover:bg-frame-cardHover cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <LinkIcon className="w-4 h-4 text-frame-accent flex-shrink-0" />
                    <span className="text-sm text-white truncate">{link.name}</span>
                  </div>
                  <span className="text-xs text-frame-textMuted self-center">
                    {link.folderId ? 'Folder share' : 'Project share'}
                  </span>
                  <span className="text-xs text-frame-textMuted self-center">
                    {date.toLocaleDateString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
