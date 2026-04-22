'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Film, X, Tag } from 'lucide-react';
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
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
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

  // All distinct tags present in the loaded set — drives the filter chip row.
  // Sorted alphabetically for a stable display order; assets without tags
  // simply don't contribute. Memoized against the assets reference so the
  // set only recomputes when data actually changes.
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) for (const t of a.tags ?? []) set.add(t);
    return Array.from(set).sort();
  }, [assets]);

  // Filter pipeline: selected tags are AND (asset must have all of them),
  // then free-text search matches filename / project name / any tag. The
  // chip row and the search box compose — a chip selection narrows the
  // pool, the search narrows again within that pool.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => {
      if (selectedTags.size > 0) {
        const tagList = a.tags ?? [];
        const selected = Array.from(selectedTags);
        for (let i = 0; i < selected.length; i++) {
          if (!tagList.includes(selected[i])) return false;
        }
      }
      if (!q) return true;
      if (a.name.toLowerCase().includes(q)) return true;
      if (a.projectName && a.projectName.toLowerCase().includes(q)) return true;
      if ((a.tags ?? []).some((t) => t.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [assets, query, selectedTags]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

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
          placeholder="Search by file name, project, or tag…"
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

      {/* Tag filter chips — only render when the loaded set has any tags.
          Multi-select uses AND so users can narrow by intersection. */}
      {allTags.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="w-3 h-3 text-frame-textMuted" />
            <span className="text-[10px] font-semibold text-frame-textMuted uppercase tracking-wider">
              Filter by tag
            </span>
            {selectedTags.size > 0 && (
              <button
                type="button"
                onClick={() => setSelectedTags(new Set())}
                className="ml-auto text-[11px] text-frame-accent hover:text-frame-accentHover transition-colors"
              >
                Clear ({selectedTags.size})
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((tag) => {
              const active = selectedTags.has(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    active
                      ? 'bg-frame-accent text-white'
                      : 'bg-frame-card border border-frame-border text-frame-textSecondary hover:text-white hover:border-frame-borderLight'
                  }`}
                  aria-pressed={active}
                >
                  {tag}
                  {active && <X className="w-3 h-3" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Result count / cap hint */}
      {!loading && (
        <div className="flex items-center justify-between mb-3 text-xs text-frame-textMuted">
          <span>
            {filtered.length} {filtered.length === 1 ? 'asset' : 'assets'}
            {query.trim() && ` matching "${query.trim()}"`}
            {selectedTags.size > 0 && ` tagged ${Array.from(selectedTags).map((t) => `#${t}`).join(' + ')}`}
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
            {query.trim() || selectedTags.size > 0
              ? 'No assets match your filters'
              : 'No assets yet'}
          </p>
          <p className="text-frame-textMuted text-sm mt-1">
            {query.trim() || selectedTags.size > 0
              ? 'Try a different search or clear the tag filter.'
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
              <div className="px-1 flex items-center gap-1.5 flex-wrap min-h-[14px]">
                {asset.projectName && (
                  <p
                    className="text-[11px] text-frame-textMuted truncate"
                    title={asset.projectName}
                  >
                    {asset.projectName}
                  </p>
                )}
                {asset.tags && asset.tags.length > 0 && (
                  <>
                    {asset.projectName && <span className="text-frame-textMuted/40">·</span>}
                    {asset.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] font-medium text-frame-accent/80"
                      >
                        #{tag}
                      </span>
                    ))}
                    {asset.tags.length > 3 && (
                      <span className="text-[10px] text-frame-textMuted">
                        +{asset.tags.length - 3}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
