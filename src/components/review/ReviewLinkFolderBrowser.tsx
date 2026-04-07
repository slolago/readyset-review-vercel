'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutGrid, LayoutList, ChevronRight } from 'lucide-react';
import { AssetCard } from '@/components/files/AssetCard';
import { AssetListView } from '@/components/files/AssetListView';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import type { Asset, ReviewLink } from '@/types';
import Link from 'next/link';

interface ReviewLinkFolderBrowserProps {
  projectId: string;
  token: string;
}

export function ReviewLinkFolderBrowser({ projectId, token }: ReviewLinkFolderBrowserProps) {
  const router = useRouter();

  const viewModeKey = `view-mode-rl-${token}`;
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    if (typeof window === 'undefined') return 'grid';
    return (localStorage.getItem(viewModeKey) as 'grid' | 'list') ?? 'grid';
  });

  useEffect(() => {
    localStorage.setItem(viewModeKey, viewMode);
  }, [viewModeKey, viewMode]);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [reviewLink, setReviewLink] = useState<ReviewLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/review-links/${token}`);
        if (res.status === 401) {
          setError('This review link is password-protected. Open the public link to view it.');
          return;
        }
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        setReviewLink(data.reviewLink);
        setAssets(data.assets ?? []);
      } catch {
        setError('Failed to load review link assets.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 py-4 border-b border-frame-border flex items-center justify-between gap-4">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-sm overflow-x-auto">
          <Link
            href={`/projects/${projectId}/review-links`}
            className="text-frame-textSecondary hover:text-white transition-colors flex-shrink-0"
          >
            Review Links
          </Link>
          <ChevronRight className="w-4 h-4 text-frame-textMuted flex-shrink-0" />
          <span className="text-white font-medium flex-shrink-0">
            {reviewLink?.name ?? token}
          </span>
          {reviewLink && (
            <span className="ml-2 text-xs text-frame-textMuted flex-shrink-0">
              ({reviewLink.folderId ? 'Folder share' : 'Project share'})
            </span>
          )}
        </nav>

        {/* View mode toggle */}
        <div className="flex items-center gap-1 flex-shrink-0">
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
        ) : error ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-frame-textMuted text-sm">{error}</p>
          </div>
        ) : assets.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-frame-textMuted text-sm">No assets in this review link</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div>
            <h3 className="text-xs font-semibold text-frame-textMuted uppercase tracking-wider mb-3">
              Assets ({assets.length})
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {assets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  onClick={() => router.push(`/projects/${projectId}/assets/${asset.id}`)}
                  hideActions={true}
                />
              ))}
            </div>
          </div>
        ) : (
          <AssetListView assets={assets} projectId={projectId} />
        )}
      </div>
    </div>
  );
}
