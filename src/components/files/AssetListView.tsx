'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Film, Image as ImageIcon, ChevronUp, ChevronDown } from 'lucide-react';
import { formatBytes, formatRelativeTime } from '@/lib/utils';
import type { Asset } from '@/types';

interface AssetListViewProps {
  assets: Asset[];
  projectId: string;
  onAssetDeleted?: () => void;
  onVersionUploaded?: () => void;
  onCopied?: () => void;
  onDuplicated?: () => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string, e: React.MouseEvent) => void;
  onSelectAll?: (ids: string[]) => void;
  onAssetDragStart?: (assetId: string, e: React.DragEvent) => void;
}

type SortKey = 'name' | 'date';
type SortDir = 'asc' | 'desc';

export function AssetListView({
  assets,
  projectId,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onAssetDragStart,
}: AssetListViewProps) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sorted = useMemo(() => {
    return [...assets].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') {
        cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      } else {
        const dateA =
          typeof a.createdAt?.toDate === 'function'
            ? a.createdAt.toDate()
            : new Date((a.createdAt as any)?._seconds * 1000 || Date.now());
        const dateB =
          typeof b.createdAt?.toDate === 'function'
            ? b.createdAt.toDate()
            : new Date((b.createdAt as any)?._seconds * 1000 || Date.now());
        cmp = dateA.getTime() - dateB.getTime();
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [assets, sortKey, sortDir]);

  if (assets.length === 0) return null;

  const allSelected = sorted.length > 0 && sorted.every(a => selectedIds?.has(a.id));
  const someSelected = !allSelected && sorted.some(a => selectedIds?.has(a.id));

  function handleSelectAllClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (onSelectAll) {
      onSelectAll(allSelected ? [] : sorted.map(a => a.id));
    }
  }

  const headerCellClass = 'py-2 px-3 text-xs font-medium text-frame-textMuted uppercase tracking-wider';
  const sortableButtonClass = 'flex items-center gap-1 hover:text-white transition-colors';

  return (
    <div>
      <h3 className="text-xs font-semibold text-frame-textMuted uppercase tracking-wider mb-3">
        Assets ({assets.length})
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-frame-border text-left">
            {onToggleSelect && (
              <th className={headerCellClass} style={{ width: '2.5rem' }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={el => { if (el) el.indeterminate = someSelected; }}
                  onChange={() => {}}
                  onClick={handleSelectAllClick}
                  className="w-4 h-4 accent-frame-accent cursor-pointer"
                  title={allSelected ? 'Deselect all' : 'Select all'}
                />
              </th>
            )}
            <th className={`${headerCellClass} w-12`} />
            <th className={headerCellClass}>
              <button
                className={`${sortableButtonClass} ${sortKey === 'name' ? 'text-white' : ''}`}
                onClick={() => toggleSort('name')}
              >
                Name
                {sortKey === 'name' && (
                  sortDir === 'asc'
                    ? <ChevronUp className="w-3 h-3" />
                    : <ChevronDown className="w-3 h-3" />
                )}
              </button>
            </th>
            <th className={headerCellClass}>Status</th>
            <th className={headerCellClass}>Comments</th>
            <th className={headerCellClass}>Size</th>
            <th className={headerCellClass}>
              <button
                className={`${sortableButtonClass} ${sortKey === 'date' ? 'text-white' : ''}`}
                onClick={() => toggleSort('date')}
              >
                Date uploaded
                {sortKey === 'date' && (
                  sortDir === 'asc'
                    ? <ChevronUp className="w-3 h-3" />
                    : <ChevronDown className="w-3 h-3" />
                )}
              </button>
            </th>
            <th className={headerCellClass}>Uploaded by</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(asset => (
            <AssetListRow
              key={asset.id}
              asset={asset}
              projectId={projectId}
              router={router}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              onAssetDragStart={onAssetDragStart}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface AssetListRowProps {
  asset: Asset;
  projectId: string;
  router: ReturnType<typeof useRouter>;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string, e: React.MouseEvent) => void;
  onAssetDragStart?: (assetId: string, e: React.DragEvent) => void;
}

function AssetListRow({
  asset,
  projectId,
  router,
  selectedIds,
  onToggleSelect,
  onAssetDragStart,
}: AssetListRowProps) {
  const isSelected = selectedIds?.has(asset.id) ?? false;
  const isUploading = asset.status === 'uploading';
  const signedUrl = (asset as any).signedUrl as string | undefined;
  const thumbnailSignedUrl = (asset as any).thumbnailSignedUrl as string | undefined;

  const date =
    typeof asset.createdAt?.toDate === 'function'
      ? asset.createdAt.toDate()
      : new Date((asset.createdAt as any)?._seconds * 1000 || Date.now());

  return (
    <tr
      data-selectable={asset.id}
      draggable={onAssetDragStart ? !isUploading : undefined}
      onDragStart={onAssetDragStart ? (e) => onAssetDragStart(asset.id, e) : undefined}
      onClick={() => router.push(`/projects/${projectId}/assets/${asset.id}`)}
      className={`cursor-pointer hover:bg-frame-card/50 transition-colors border-b border-frame-border/40 ${
        isSelected ? 'bg-frame-accent/10' : ''
      }`}
    >
      {onToggleSelect && (
        <td
          className="px-3 py-2 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(asset.id, e);
          }}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => {}}
            className="w-4 h-4 accent-frame-accent pointer-events-none"
          />
        </td>
      )}

      {/* Thumbnail */}
      <td className="px-3 py-2 w-12">
        <div className="w-10 h-10 rounded overflow-hidden bg-frame-bg flex-shrink-0 flex items-center justify-center">
          {asset.type === 'image' && signedUrl ? (
            <img src={signedUrl} alt={asset.name} className="w-full h-full object-cover" />
          ) : asset.type === 'video' && thumbnailSignedUrl ? (
            <img src={thumbnailSignedUrl} alt={asset.name} className="w-full h-full object-cover" />
          ) : asset.type === 'video' ? (
            <Film className="w-5 h-5 text-frame-textMuted" />
          ) : (
            <ImageIcon className="w-5 h-5 text-frame-textMuted" />
          )}
        </div>
      </td>

      {/* Name */}
      <td className="px-3 py-2">
        <span className="font-medium text-white truncate block max-w-[240px]">{asset.name}</span>
      </td>

      {/* Status */}
      <td className="px-3 py-2">
        {asset.status === 'ready' ? (
          <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-400 font-medium">
            Ready
          </span>
        ) : (
          <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-500/20 text-yellow-400 font-medium">
            Uploading
          </span>
        )}
      </td>

      {/* Comments */}
      <td className="px-3 py-2">
        <span className="text-frame-textMuted">—</span>
      </td>

      {/* Size */}
      <td className="px-3 py-2">
        <span className="text-frame-textSecondary">{formatBytes(asset.size)}</span>
      </td>

      {/* Date uploaded */}
      <td className="px-3 py-2" title={date.toLocaleDateString()}>
        <span className="text-frame-textSecondary">{formatRelativeTime(date)}</span>
      </td>

      {/* Uploaded by */}
      <td className="px-3 py-2">
        <span className="text-frame-textSecondary truncate max-w-[120px] block">{asset.uploadedBy}</span>
      </td>
    </tr>
  );
}
