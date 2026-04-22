'use client';

import { useState, useMemo, useRef, useEffect, memo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  Film, Image as ImageIcon, ChevronUp, ChevronDown, Pencil, Copy, CopyPlus,
  Move, Download, Link as LinkIcon, Trash2, ExternalLink, Check,
  ChevronDown as ChevronDownIcon, Upload, Layers,
  FileText, FileCode, FileArchive, Type, Palette,
} from 'lucide-react';
import { formatBytes, formatRelativeTime, forceDownload } from '@/lib/utils';
import { FILE_INPUT_ACCEPT, TYPE_META, type IconName } from '@/lib/file-types';

const ICON_COMPONENTS: Record<IconName, React.ComponentType<{ className?: string }>> = {
  Film,
  Image: ImageIcon,
  FileText,
  FileCode,
  FileArchive,
  Type,
  Palette,
};
import { useUserNames } from '@/hooks/useUserNames';
import { useAuth } from '@/hooks/useAuth';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { InlineRename } from '@/components/ui/InlineRename';
import { useUpload } from '@/hooks/useAssets';
import { useContextMenuController } from '@/components/ui/ContextMenu';
import { useRenameController } from './FolderBrowser';
import { buildFileBrowserActions } from './fileBrowserActions';
import { ReviewStatusBadge } from '@/components/ui/ReviewStatusBadge';
import dynamic from 'next/dynamic';
import { ModalSkeleton } from '@/components/ui/ModalSkeleton';
import { SmartCopyModal } from './SmartCopyModal';
import { UploadPlaceholderRow } from './UploadPlaceholderRow';

const VersionStackModal = dynamic(
  () => import('./VersionStackModal').then((m) => m.VersionStackModal),
  { ssr: false, loading: () => <ModalSkeleton /> }
);
import type { ReviewStatus, Folder } from '@/types';
import toast from 'react-hot-toast';
import type { Asset } from '@/types';

const REVIEW_STATUS_OPTIONS: { value: ReviewStatus | null; label: string }[] = [
  { value: 'approved', label: 'Approved' },
  { value: 'in_review', label: 'In Review' },
  { value: 'needs_revision', label: 'Needs Revision' },
  { value: null, label: 'Clear status' },
];

interface AssetListViewProps {
  assets: Asset[];
  projectId: string;
  /** Active uploads targeting THIS folder — rendered as placeholder rows
      at the top of the table so the list view has the same feedback as
      the grid. */
  uploadPlaceholders?: import('@/types').UploadItem[];
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
  uploadPlaceholders,
  onAssetDeleted,
  onVersionUploaded,
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

  const placeholders = uploadPlaceholders ?? [];
  if (assets.length === 0 && placeholders.length === 0) return null;

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
        Assets ({assets.length + placeholders.length})
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
            <th className={headerCellClass}>Review</th>
            <th className={headerCellClass}>Comments</th>
            <th className={headerCellClass}>Versions</th>
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
          {placeholders.map((item) => (
            <UploadPlaceholderRow
              key={`upload-${item.id}`}
              item={item}
              hasCheckboxColumn={!!onToggleSelect}
            />
          ))}
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
              onVersionUploaded={onVersionUploaded}
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
  onVersionUploaded?: () => void;
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
  onVersionUploaded,
  onCopied,
  onDuplicated,
  onRequestMove,
}: AssetListRowProps) {
  const { getIdToken } = useAuth();
  const confirm = useConfirm();
  const { uploadFile } = useUpload();
  const ctxMenu = useContextMenuController();
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [showCopyToModal, setShowCopyToModal] = useState(false);
  const [allFolders, setAllFolders] = useState<Folder[]>([]);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const { activeId, setActiveId } = useRenameController();
  const myRenameKey = `asset-${asset.id}`;
  const isRenaming = activeId === myRenameKey;
  const closeRename = () => { if (activeId === myRenameKey) setActiveId(null); };
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSelected = selectedIds?.has(asset.id) ?? false;
  const isUploading = asset.status === 'uploading';
  const signedUrl = (asset as any).signedUrl as string | undefined;
  const thumbnailSignedUrl = (asset as any).thumbnailSignedUrl as string | undefined;
  const downloadUrl = (asset as any).downloadUrl as string | undefined;
  const versionCount = (asset as any)._versionCount || 1;

  // Close status menu on outside click
  useEffect(() => {
    if (!statusMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setStatusMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [statusMenuOpen]);

  const handleSetStatus = async (reviewStatus: ReviewStatus | null) => {
    setStatusMenuOpen(false);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reviewStatus }),
      });
      if (res.ok) {
        toast.success(reviewStatus ? 'Status updated' : 'Status cleared');
        onAssetDeleted?.(); // refetch
      } else {
        toast.error('Failed to update status');
      }
    } catch {
      toast.error('Failed to update status');
    }
  };

  const commitRename = async (next: string) => {
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: next }),
      });
      if (res.ok) { toast.success('Renamed'); onAssetDeleted?.(); }
      else toast.error('Rename failed');
    } catch { toast.error('Rename failed'); }
    finally { closeRename(); }
  };

  const openCopyTo = async () => {
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/folders?projectId=${asset.projectId}&all=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAllFolders(data.folders);
      }
    } catch {}
    setShowCopyToModal(true);
  };

  const handleCopyTo = async (targetFolderId: string | null, latestVersionOnly: boolean) => {
    try {
      const token = await getIdToken();
      const res = await fetch('/api/assets/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ assetId: asset.id, targetFolderId, latestVersionOnly }),
      });
      if (res.ok) {
        toast.success('Copied');
        onCopied?.();
      } else {
        toast.error('Copy failed');
      }
    } catch {
      toast.error('Copy failed');
    } finally {
      setShowCopyToModal(false);
    }
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

  const handleUploadVersion = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const assetId = await uploadFile(file, asset.projectId, asset.folderId, asset.id);
    if (assetId) {
      toast.success('New version uploaded');
      onVersionUploaded?.();
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Delete "${asset.name}"?`,
      message: 'This cannot be undone.',
      destructive: true,
    });
    if (!ok) return;
    try {
      const token = await getIdToken();
      // BLK-01: when the row represents a stack (_versionCount > 1), delete every version
      const allVersions = ((asset as any)._versionCount ?? 1) > 1;
      const url = `/api/assets/${asset.id}${allVersions ? '?allVersions=true' : ''}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success(`Deleted "${asset.name}"`);
        onAssetDeleted?.();
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ? `Delete failed: ${data.error}` : 'Failed to delete');
      }
    } catch (err) { toast.error(`Failed to delete: ${(err as Error).message || 'network error'}`); }
  };

  const handleDownload = () => {
    const url = downloadUrl ?? signedUrl ?? thumbnailSignedUrl;
    if (!url) return;
    forceDownload(url, asset.name);
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

  // Unified action list for the row right-click menu. List view does not
  // currently surface "Stack onto" (no folder siblings in scope here), so
  // onStackOnto is omitted — a deliberate parity decision with the existing
  // behavior.
  const assetActions = buildFileBrowserActions('asset', {
    onOpen: () => router.push(`/projects/${projectId}/assets/${asset.id}`),
    onRename: () => setActiveId(myRenameKey),
    onDuplicate: handleDuplicate,
    onCopyTo: openCopyTo,
    onMoveTo: () => onRequestMove?.(asset.id),
    onUploadVersion: handleUploadVersion,
    onManageVersions: () => setShowVersionModal(true),
    onDownload: handleDownload,
    onGetLink: handleGetLink,
    onSetStatus: handleSetStatus,
    onDelete: handleDelete,
    icons: {
      open: <ExternalLink className="w-4 h-4" />,
      rename: <Pencil className="w-4 h-4" />,
      duplicate: <CopyPlus className="w-4 h-4" />,
      copyTo: <Copy className="w-4 h-4" />,
      moveTo: <Move className="w-4 h-4" />,
      uploadVersion: <Upload className="w-4 h-4" />,
      manageVersions: <Layers className="w-4 h-4" />,
      download: <Download className="w-4 h-4" />,
      getLink: <LinkIcon className="w-4 h-4" />,
      approved: <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />,
      needsRevision: <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />,
      inReview: <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />,
      clearStatus: <span className="w-2 h-2 rounded-full bg-white/20 inline-block" />,
      delete: <Trash2 className="w-4 h-4" />,
    },
  });

  return (
    <>
      <input ref={fileInputRef} type="file" accept={FILE_INPUT_ACCEPT} className="hidden" onChange={handleFileSelected} />
      <tr
        data-selectable={asset.id}
        draggable={onAssetDragStart ? !isUploading : undefined}
        onDragStart={onAssetDragStart ? (e) => onAssetDragStart(asset.id, e) : undefined}
        onClick={() => router.push(`/projects/${projectId}/assets/${asset.id}`)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          ctxMenu.open(`row-${asset.id}`, { x: e.clientX, y: e.clientY }, assetActions);
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
          <div className="relative w-10 h-10 rounded overflow-hidden bg-frame-bg flex-shrink-0 flex items-center justify-center">
            {asset.type === 'image' && signedUrl ? (
              <Image src={signedUrl} alt={asset.name} fill sizes="40px" className="object-cover" unoptimized />
            ) : asset.type === 'video' && thumbnailSignedUrl ? (
              <Image src={thumbnailSignedUrl} alt={asset.name} fill sizes="40px" className="object-cover" unoptimized />
            ) : (() => {
              const Icon = ICON_COMPONENTS[TYPE_META[asset.type].iconName];
              return <Icon className="w-5 h-5 text-frame-textMuted" />;
            })()}
          </div>
        </td>

        {/* Name */}
        <td
          className="px-3 py-2"
          onClick={(e) => { if (isRenaming) e.stopPropagation(); }}
        >
          {isRenaming ? (
            <InlineRename
              value={asset.name}
              onCommit={commitRename}
              onCancel={closeRename}
            />
          ) : (
            <span className="font-medium text-white truncate block max-w-[240px]" title={asset.name}>{asset.name}</span>
          )}
        </td>

        {/* Review status — clickable dropdown */}
        <td
          className="px-3 py-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative" ref={statusMenuRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setStatusMenuOpen(v => !v); }}
              onKeyDown={(e) => { if (e.key === 'Escape') setStatusMenuOpen(false); }}
              className="flex items-center gap-1 group"
              aria-expanded={statusMenuOpen}
              aria-haspopup="menu"
              title="Set review status"
            >
              {asset.reviewStatus ? (
                <ReviewStatusBadge status={asset.reviewStatus} />
              ) : (
                <span className="text-xs text-frame-textMuted group-hover:text-white transition-colors">—</span>
              )}
              <ChevronDownIcon className="w-3 h-3 text-frame-textMuted opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            {statusMenuOpen && (
              <div role="menu" className="absolute left-0 top-full mt-1 z-50 bg-frame-card border border-frame-border rounded-xl shadow-2xl overflow-hidden min-w-[160px]">
                {REVIEW_STATUS_OPTIONS.map(opt => (
                  <button
                    key={String(opt.value)}
                    role="menuitem"
                    onClick={() => handleSetStatus(opt.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setStatusMenuOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-frame-border/50 transition-colors flex items-center gap-2 ${
                      opt.value === null ? 'text-frame-textMuted border-t border-frame-border/50 mt-1 pt-2' : 'text-white'
                    }`}
                  >
                    {opt.value && (
                      <ReviewStatusBadge status={opt.value} />
                    )}
                    {opt.value === null && opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </td>

        {/* Comments */}
        <td className="px-3 py-2">
          <span className="text-frame-textMuted">
            {(asset as any)._commentCount ?? 0}
          </span>
        </td>

        {/* Versions */}
        <td className="px-3 py-2">
          {versionCount > 1 ? (
            <span className="inline-flex items-center gap-1 text-xs text-frame-textSecondary">
              <Layers className="w-3.5 h-3.5" />
              {versionCount}
            </span>
          ) : (
            <span className="text-frame-textMuted">—</span>
          )}
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
      {showCopyToModal && (
        <SmartCopyModal
          folders={allFolders}
          versionCount={versionCount}
          onPick={handleCopyTo}
          onClose={() => setShowCopyToModal(false)}
        />
      )}
      {showVersionModal && (
        <VersionStackModal
          asset={asset}
          onClose={() => setShowVersionModal(false)}
          onDeleted={onAssetDeleted}
          getIdToken={getIdToken}
        />
      )}
    </>
  );
}
