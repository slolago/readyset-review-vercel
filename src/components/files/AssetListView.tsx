'use client';

import { useState, useMemo, memo } from 'react';
import { useRouter } from 'next/navigation';
import { Film, Image as ImageIcon, ChevronUp, ChevronDown, Pencil, CopyPlus, Move, Download, Link as LinkIcon, Trash2, ExternalLink, Check } from 'lucide-react';
import { formatBytes, formatRelativeTime } from '@/lib/utils';
import { useUserNames } from '@/hooks/useUserNames';
import { useAuth } from '@/hooks/useAuth';
import { ContextMenu } from '@/components/ui/ContextMenu';
import type { MenuItem } from '@/components/ui/ContextMenu';
import toast from 'react-hot-toast';
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
  onRequestMove?: (assetId: string) => void;
}

type SortKey = 'name' | 'date';
type SortDir = 'asc' | 'desc';

export const AssetListView = memo(function AssetListView({
  assets,
  projectId,
  onAssetDeleted,
  onCopied,
  onDuplicated,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onAssetDragStart,
  onRequestMove,
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

  const uploaderIds = useMemo(() => assets.map(a => a.uploadedBy).filter(Boolean), [assets]);
  const uploaderNames = useUserNames(uploaderIds);

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
                <div
                  onClick={handleSelectAllClick}
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer transition-colors ${
                    allSelected
                      ? 'bg-frame-accent border-frame-accent'
                      : someSelected
                      ? 'bg-frame-accent/50 border-frame-accent'
                      : 'bg-transparent border-white/30 hover:border-white/50'
                  }`}
                  title={allSelected ? 'Deselect all' : 'Select all'}
                >
                  {(allSelected || someSelected) && (
                    <Check className="w-3 h-3 text-white" strokeWidth={3} />
                  )}
                </div>
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
              uploaderName={uploaderNames[asset.uploadedBy]}
              onAssetDeleted={onAssetDeleted}
              onCopied={onCopied}
              onDuplicated={onDuplicated}
              onRequestMove={onRequestMove}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
});

interface AssetListRowProps {
  asset: Asset;
  projectId: string;
  router: ReturnType<typeof useRouter>;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string, e: React.MouseEvent) => void;
  onAssetDragStart?: (assetId: string, e: React.DragEvent) => void;
  uploaderName?: string;
  onAssetDeleted?: () => void;
  onCopied?: () => void;
  onDuplicated?: () => void;
  onRequestMove?: (assetId: string) => void;
}

function AssetListRow({
  asset,
  projectId,
  router,
  selectedIds,
  onToggleSelect,
  onAssetDragStart,
  uploaderName,
  onAssetDeleted,
  onCopied,
  onDuplicated,
  onRequestMove,
}: AssetListRowProps) {
  const { getIdToken } = useAuth();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const isSelected = selectedIds?.has(asset.id) ?? false;
  const isUploading = asset.status === 'uploading';
  const signedUrl = (asset as any).signedUrl as string | undefined;
  const thumbnailSignedUrl = (asset as any).thumbnailSignedUrl as string | undefined;
  const downloadUrl = (asset as any).downloadUrl as string | undefined;

  const handleRename = async () => {
    const name = window.prompt('Rename asset:', asset.name);
    if (!name || name.trim() === asset.name) return;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) { toast.success('Renamed'); onAssetDeleted?.(); }
      else toast.error('Rename failed');
    } catch { toast.error('Rename failed'); }
  };

  const handleDuplicate = async () => {
    try {
      const token = await getIdToken();
      const res = await fetch('/api/assets/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ assetId: asset.id }),
      });
      if (res.ok) { toast.success('Duplicated'); onDuplicated?.(); }
      else toast.error('Duplicate failed');
    } catch { toast.error('Duplicate failed'); }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this asset?')) return;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { toast.success('Asset deleted'); onAssetDeleted?.(); }
    } catch { toast.error('Failed to delete'); }
  };

  const handleDownload = () => {
    const url = downloadUrl ?? signedUrl ?? thumbnailSignedUrl;
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = asset.name;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleGetLink = () => {
    const url = `${window.location.origin}/projects/${projectId}/assets/${asset.id}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied');
  };

  const date =
    typeof asset.createdAt?.toDate === 'function'
      ? asset.createdAt.toDate()
      : new Date((asset.createdAt as any)?._seconds * 1000 || Date.now());

  return (
    <>
    <tr
      data-selectable={asset.id}
      draggable={onAssetDragStart ? !isUploading : undefined}
      onDragStart={onAssetDragStart ? (e) => onAssetDragStart(asset.id, e) : undefined}
      onClick={() => router.push(`/projects/${projectId}/assets/${asset.id}`)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
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
          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors pointer-events-none ${
            isSelected ? 'bg-frame-accent border-frame-accent' : 'bg-transparent border-white/30'
          }`}>
            {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
          </div>
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
        <span className="text-frame-textSecondary truncate max-w-[120px] block">
          {uploaderName ?? asset.uploadedBy}
        </span>
      </td>
    </tr>
    {contextMenu && (
      <ContextMenu
        position={contextMenu}
        onClose={() => setContextMenu(null)}
        items={[
          { label: 'Open', icon: <ExternalLink className="w-4 h-4" />, onClick: () => router.push(`/projects/${projectId}/assets/${asset.id}`) },
          { label: 'Rename', icon: <Pencil className="w-4 h-4" />, onClick: handleRename },
          { label: 'Duplicate', icon: <CopyPlus className="w-4 h-4" />, onClick: handleDuplicate },
          { label: 'Move to', icon: <Move className="w-4 h-4" />, onClick: () => onRequestMove?.(asset.id) },
          { label: 'Download', icon: <Download className="w-4 h-4" />, onClick: handleDownload },
          { label: 'Get link', icon: <LinkIcon className="w-4 h-4" />, onClick: handleGetLink },
          { label: 'Delete', icon: <Trash2 className="w-4 h-4" />, onClick: handleDelete, danger: true, dividerBefore: true },
        ]}
      />
    )}
    </>
  );
}
