'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Film, X, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AssetCard } from '@/components/files/AssetCard';
import { FilterPopover } from '@/components/ui/FilterPopover';
import { RatingStars } from '@/components/ui/RatingStars';
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

  // Filter state — multi-select dimensions use Set, duration uses string
  // inputs (kept as strings so empty = unbounded).
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [durationMin, setDurationMin] = useState<string>('');
  const [durationMax, setDurationMax] = useState<string>('');
  // 0 = no filter; 1–5 = show assets rated >= minRating.
  const [minRating, setMinRating] = useState<number>(0);

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

  // Filter option sets derived from the loaded assets so the UI only shows
  // values that could actually match something. If/when we add server-side
  // pagination, these become the "within-the-loaded-window" option sets —
  // the server would surface a broader list via a dedicated endpoint.
  const projectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of assets) {
      if (a.projectId && a.projectName) map.set(a.projectId, a.projectName);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ value: id, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [assets]);

  const tagOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) for (const t of a.tags ?? []) set.add(t);
    return Array.from(set)
      .sort()
      .map((t) => ({ value: t, label: t }));
  }, [assets]);

  const durMin = durationMin ? parseFloat(durationMin) : null;
  const durMax = durationMax ? parseFloat(durationMax) : null;
  const durationActive =
    (durMin !== null && !Number.isNaN(durMin)) ||
    (durMax !== null && !Number.isNaN(durMax));

  // Filter pipeline: each dimension narrows the set, then the free-text
  // search applies on top. Multi-select semantics:
  //   - Project: OR (an asset is in exactly one project)
  //   - Tag: OR (pick categories to include — more forgiving as tag sets grow)
  //   - Duration: inclusive range; non-duration assets excluded while active
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => {
      if (selectedProjectIds.size > 0 && !selectedProjectIds.has(a.projectId)) {
        return false;
      }
      if (selectedTags.size > 0) {
        const tagList = a.tags ?? [];
        const selected = Array.from(selectedTags);
        const hasAny = selected.some((t) => tagList.includes(t));
        if (!hasAny) return false;
      }
      if (durationActive) {
        const d = a.duration;
        if (typeof d !== 'number') return false;
        if (durMin !== null && !Number.isNaN(durMin) && d < durMin) return false;
        if (durMax !== null && !Number.isNaN(durMax) && d > durMax) return false;
      }
      if (minRating > 0) {
        // Unrated assets are excluded while the rating filter is active —
        // matches the "show me the best" mental model.
        if (!a.rating || a.rating < minRating) return false;
      }
      if (!q) return true;
      if (a.name.toLowerCase().includes(q)) return true;
      if (a.projectName && a.projectName.toLowerCase().includes(q)) return true;
      if ((a.tags ?? []).some((t) => t.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [assets, query, selectedProjectIds, selectedTags, durMin, durMax, durationActive, minRating]);

  const anyFilterActive =
    selectedProjectIds.size > 0 || selectedTags.size > 0 || durationActive || minRating > 0;

  const clearAll = () => {
    setSelectedProjectIds(new Set());
    setSelectedTags(new Set());
    setDurationMin('');
    setDurationMax('');
    setMinRating(0);
  };

  const capped =
    !loading && totalAvailable !== null && limit !== null && totalAvailable > limit;

  const toggleIn = (set: Set<string>, value: string): Set<string> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Assets</h1>
        <p className="text-sm text-frame-textSecondary">
          All assets across the projects you have access to.
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-3">
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

      {/* Filter toolbar — each popover hosts its own checkable list or range
          input. Keeping the popover content inline (vs. bespoke components)
          because the contents are small and page-specific. */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        <FilterPopover label="Project" activeCount={selectedProjectIds.size}>
          <SearchableCheckboxList
            items={projectOptions}
            selected={selectedProjectIds}
            onToggle={(id) => setSelectedProjectIds((p) => toggleIn(p, id))}
            onClear={selectedProjectIds.size > 0 ? () => setSelectedProjectIds(new Set()) : undefined}
            searchPlaceholder="Search projects…"
            emptyMessage="No projects in view."
          />
        </FilterPopover>

        <FilterPopover label="Tag" activeCount={selectedTags.size}>
          <SearchableCheckboxList
            items={tagOptions}
            selected={selectedTags}
            onToggle={(tag) => setSelectedTags((p) => toggleIn(p, tag))}
            onClear={selectedTags.size > 0 ? () => setSelectedTags(new Set()) : undefined}
            searchPlaceholder="Search tags…"
            emptyMessage="No tags yet. Add them from the asset viewer's Info panel."
          />
        </FilterPopover>

        <FilterPopover label="Duration" activeCount={durationActive ? 1 : 0}>
          <DurationRangeInput
            min={durationMin}
            max={durationMax}
            onMinChange={setDurationMin}
            onMaxChange={setDurationMax}
          />
        </FilterPopover>

        <FilterPopover label="Rating" activeCount={minRating > 0 ? 1 : 0}>
          <RatingThresholdInput value={minRating} onChange={setMinRating} />
        </FilterPopover>

        {anyFilterActive && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-frame-textMuted hover:text-white transition-colors ml-1 px-2 py-1.5"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Result count / cap hint */}
      {!loading && (
        <div className="flex items-center justify-between mb-3 text-xs text-frame-textMuted">
          <span>
            {filtered.length} {filtered.length === 1 ? 'asset' : 'assets'}
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
            {query.trim() || anyFilterActive ? 'No assets match your filters' : 'No assets yet'}
          </p>
          <p className="text-frame-textMuted text-sm mt-1">
            {query.trim() || anyFilterActive
              ? 'Try a different search or clear the filters.'
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

// ── Popover content helpers ──────────────────────────────────────────────────

interface CheckboxItem {
  value: string;
  label: string;
}

function SearchableCheckboxList({
  items,
  selected,
  onToggle,
  onClear,
  searchPlaceholder = 'Search…',
  emptyMessage,
}: {
  items: CheckboxItem[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onClear?: () => void;
  searchPlaceholder?: string;
  emptyMessage?: string;
}) {
  const [q, setQ] = useState('');
  const visible = useMemo(() => {
    const qLower = q.trim().toLowerCase();
    if (!qLower) return items;
    return items.filter((i) => i.label.toLowerCase().includes(qLower));
  }, [items, q]);

  return (
    <div className="flex flex-col">
      <div className="p-2 border-b border-frame-border">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="w-full px-2.5 py-1.5 bg-frame-bg border border-frame-border rounded-md text-xs text-white placeholder-frame-textMuted focus:outline-none focus:border-frame-accent"
          autoFocus
        />
      </div>
      <div className="max-h-64 overflow-y-auto py-1">
        {items.length === 0 ? (
          <p className="px-3 py-4 text-xs text-frame-textMuted text-center leading-relaxed">
            {emptyMessage ?? 'No options.'}
          </p>
        ) : visible.length === 0 ? (
          <p className="px-3 py-3 text-xs text-frame-textMuted text-center">
            No matches.
          </p>
        ) : (
          visible.map((item) => {
            const active = selected.has(item.value);
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => onToggle(item.value)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                  active
                    ? 'bg-frame-accent/10 text-white'
                    : 'text-frame-textSecondary hover:text-white hover:bg-frame-cardHover'
                }`}
                aria-pressed={active}
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    active
                      ? 'bg-frame-accent border-frame-accent'
                      : 'border-frame-border'
                  }`}
                >
                  {active && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                </span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })
        )}
      </div>
      {onClear && (
        <div className="border-t border-frame-border px-2 py-1.5">
          <button
            type="button"
            onClick={onClear}
            className="w-full text-[11px] text-frame-textMuted hover:text-white transition-colors py-1"
          >
            Clear selection
          </button>
        </div>
      )}
    </div>
  );
}

function DurationRangeInput({
  min,
  max,
  onMinChange,
  onMaxChange,
}: {
  min: string;
  max: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
}) {
  const presets: Array<{ label: string; min: string; max: string }> = [
    { label: 'Under 30s', min: '', max: '30' },
    { label: '30s – 2m', min: '30', max: '120' },
    { label: '2m – 10m', min: '120', max: '600' },
    { label: 'Over 10m', min: '600', max: '' },
  ];

  return (
    <div className="p-3 space-y-3">
      <div>
        <p className="text-[10px] font-semibold text-frame-textMuted uppercase tracking-wider mb-1.5">
          Presets
        </p>
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => {
            const active = p.min === min && p.max === max;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  onMinChange(p.min);
                  onMaxChange(p.max);
                }}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  active
                    ? 'bg-frame-accent text-white'
                    : 'bg-frame-border/50 text-frame-textSecondary hover:text-white hover:bg-frame-border'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="text-[10px] font-semibold text-frame-textMuted uppercase tracking-wider mb-1.5">
          Custom (seconds)
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={min}
            onChange={(e) => onMinChange(e.target.value)}
            placeholder="Min"
            aria-label="Minimum duration in seconds"
            className="w-full px-2.5 py-1.5 bg-frame-bg border border-frame-border rounded-md text-xs text-white placeholder-frame-textMuted focus:outline-none focus:border-frame-accent"
          />
          <span className="text-xs text-frame-textMuted">–</span>
          <input
            type="number"
            min={0}
            value={max}
            onChange={(e) => onMaxChange(e.target.value)}
            placeholder="Max"
            aria-label="Maximum duration in seconds"
            className="w-full px-2.5 py-1.5 bg-frame-bg border border-frame-border rounded-md text-xs text-white placeholder-frame-textMuted focus:outline-none focus:border-frame-accent"
          />
        </div>
        {(min || max) && (
          <button
            type="button"
            onClick={() => {
              onMinChange('');
              onMaxChange('');
            }}
            className="mt-2 text-[11px] text-frame-textMuted hover:text-white transition-colors"
          >
            Clear
          </button>
        )}
      </div>
      <p className="text-[10px] text-frame-textMuted leading-relaxed">
        Only assets with a duration (video / audio) are filtered — images and
        documents are hidden while this filter is active.
      </p>
    </div>
  );
}

function RatingThresholdInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="p-3 space-y-2">
      <p className="text-[10px] font-semibold text-frame-textMuted uppercase tracking-wider">
        Minimum rating
      </p>
      <div className="flex items-center gap-3">
        <RatingStars value={value} onChange={onChange} size="md" />
        <span className="text-xs text-frame-textSecondary tabular-nums min-w-[40px]">
          {value > 0 ? `${value}+ ★` : 'Any'}
        </span>
      </div>
      <p className="text-[10px] text-frame-textMuted leading-relaxed">
        Shows assets rated at or above the selected threshold. Unrated assets
        are hidden while this filter is active. Click the current star to
        clear.
      </p>
      {value > 0 && (
        <button
          type="button"
          onClick={() => onChange(0)}
          className="text-[11px] text-frame-textMuted hover:text-white transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  );
}
