'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Film, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AssetCard } from '@/components/files/AssetCard';
import type { Asset } from '@/types';

interface AssetWithProject extends Asset {
  projectName?: string;
}

export default function AssetsPage() {
  const router = useRouter();
  const { getIdToken } = useAuth();
  const [assets, setAssets] = useState<AssetWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [totalAvailable, setTotalAvailable] = useState<number | null>(null);
  const [limit, setLimit] = useState<number | null>(null);

  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch('/api/assets/all', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (aborted) return;
        if (res.ok) {
          const data = (await res.json()) as {
            assets: AssetWithProject[];
            totalAvailable?: number;
            limit?: number;
          };
          setAssets(data.assets ?? []);
          setTotalAvailable(data.totalAvailable ?? null);
          setLimit(data.limit ?? null);
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [getIdToken]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((a) => {
      if (a.name.toLowerCase().includes(q)) return true;
      if (a.projectName && a.projectName.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [assets, query]);

  const capped =
    !loading && totalAvailable !== null && limit !== null && totalAvailable > limit;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Assets</h1>
        <p className="text-sm text-frame-textSecondary">
          All assets across the projects you have access to.
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-frame-textMuted pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by file or project name…"
          aria-label="Search assets"
          className="w-full pl-10 pr-10 py-2.5 bg-frame-card border border-frame-border rounded-xl text-sm text-white placeholder-frame-textMuted focus:outline-none focus:border-frame-accent focus:ring-1 focus:ring-frame-accent/30 transition-all"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-frame-textMuted hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Result count / cap hint */}
      {!loading && (
        <div className="flex items-center justify-between mb-3 text-xs text-frame-textMuted">
          <span>
            {filtered.length} {filtered.length === 1 ? 'asset' : 'assets'}
            {query.trim() && ` matching "${query.trim()}"`}
          </span>
          {capped && (
            <span className="text-frame-textMuted/80">
              Showing most recent {limit} of {totalAvailable} — search narrows within this window
            </span>
          )}
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="aspect-video bg-frame-card rounded-xl animate-pulse border border-frame-border"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-frame-card border border-frame-border rounded-2xl">
          <div className="w-12 h-12 bg-frame-accent/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Film className="w-6 h-6 text-frame-accent" />
          </div>
          <p className="text-white font-semibold">
            {query.trim() ? 'No assets match your search' : 'No assets yet'}
          </p>
          <p className="text-frame-textMuted text-sm mt-1">
            {query.trim()
              ? 'Try a different file or project name.'
              : 'Upload assets from any project and they\u2019ll appear here.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((asset) => (
            <div key={asset.id} className="flex flex-col gap-1">
              <AssetCard
                asset={asset}
                onClick={() =>
                  router.push(`/projects/${asset.projectId}/assets/${asset.id}`)
                }
                hideActions
              />
              {asset.projectName && (
                <p
                  className="text-[11px] text-frame-textMuted truncate px-1"
                  title={asset.projectName}
                >
                  {asset.projectName}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
