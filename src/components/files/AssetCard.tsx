'use client';

import Image from 'next/image';
import { useRef, useCallback, useState, useEffect, memo } from 'react';
import { Play, Image as ImageIcon, Film, MoreHorizontal, Trash2, Clock, Upload, Layers, Check, Pencil, Copy, CopyPlus, Home, Folder as FolderIcon, X, ExternalLink, Move as MoveIcon, Download, Link as LinkIcon, MessageSquare, CheckCircle2, AlertCircle, Unlink, GripVertical, Info } from 'lucide-react';
import { formatDuration, formatBytes, forceDownload } from '@/lib/utils';
import type { Asset, Folder } from '@/types';
import type { ReviewStatus } from '@/types';
import { Dropdown } from '@/components/ui/Dropdown';
import { ContextMenu } from '@/components/ui/ContextMenu';
import type { MenuItem } from '@/components/ui/ContextMenu';
import { ReviewStatusBadge } from '@/components/ui/ReviewStatusBadge';
import { useAuth } from '@/hooks/useAuth';
import { useUpload } from '@/hooks/useAssets';
import toast from 'react-hot-toast';

interface AssetCardProps {
  asset: Asset;
  onClick?: () => void;
  onDeleted?: () => void;
  onVersionUploaded?: () => void;
  onCopied?: () => void;
  onDuplicated?: () => void;
  onRequestMove?: () => void;
  isSelected?: boolean;
  onToggleSelect?: (e: React.MouseEvent) => void;
  onDragStart?: (e: React.DragEvent) => void;
  hideActions?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  isDropTarget?: boolean;
}

export const AssetCard = memo(function AssetCard({
  asset, onClick, onDeleted, onVersionUploaded, onCopied, onDuplicated,
  onRequestMove, isSelected, onToggleSelect, onDragStart, hideActions,
  onDragOver, onDragLeave, onDrop, isDropTarget
}: AssetCardProps) {
  const { getIdToken } = useAuth();
  const { uploadFile } = useUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const versionCount = (asset as any)._versionCount || 1;
  const commentCount = ((asset as any)._commentCount as number | undefined) ?? 0;
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [showCopyToModal, setShowCopyToModal] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [allFolders, setAllFolders] = useState<Folder[]>([]);
  const signedUrl = (asset as any).signedUrl as string | undefined;
  const thumbnailUrl = (asset as any).thumbnailSignedUrl as string | undefined;
  const downloadUrl = (asset as any).downloadUrl as string | undefined;
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // When a video element loads its metadata, seek to a non-black frame
  const handleVideoMetadata = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const seekTo = Math.min((vid.duration || 0) * 0.1, 2) || 1;
    vid.currentTime = seekTo;
  }, []);

  const handleRename = () => {
    setRenameValue(asset.name);
    setIsRenaming(true);
    setTimeout(() => renameInputRef.current?.select(), 0);
  };

  const commitRename = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === asset.name) {
      setIsRenaming(false);
      return;
    }
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        toast.success('Renamed');
        onDeleted?.(); // reuse the refresh callback to trigger parent refetch
      } else {
        toast.error('Rename failed');
      }
    } catch {
      toast.error('Rename failed');
    } finally {
      setIsRenaming(false);
    }
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
        body: JSON.stringify({ assetId: asset.id }), // no targetFolderId → defaults to same folder
      });
      if (res.ok) {
        toast.success('Duplicated');
        onDuplicated?.();
      } else {
        toast.error('Duplicate failed');
      }
    } catch {
      toast.error('Duplicate failed');
    }
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
    if (!confirm('Delete this asset?')) return;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success('Asset deleted');
        onDeleted?.();
      }
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleDownload = () => {
    const url = downloadUrl ?? signedUrl;
    if (!url) return;
    forceDownload(url, asset.name);
  };

  const handleGetLink = () => {
    const url = `${window.location.origin}/projects/${asset.projectId}/assets/${asset.id}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied');
  };

  const handleSetStatus = async (reviewStatus: ReviewStatus | null) => {
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reviewStatus }),
      });
      if (res.ok) {
        toast.success(reviewStatus ? 'Status updated' : 'Status cleared');
        onDeleted?.();
      } else {
        toast.error('Failed to update status');
      }
    } catch {
      toast.error('Failed to update status');
    }
  };

  const isUploading = asset.status === 'uploading';

  return (
    <>
      <input ref={fileInputRef} type="file" accept="video/*,image/*" className="hidden" onChange={handleFileSelected} />
    <div
      data-selectable={asset.id}
      draggable={!isUploading}
      onDragStart={isUploading ? undefined : onDragStart}
      onDragOver={isUploading ? undefined : onDragOver}
      onDragLeave={isUploading ? undefined : onDragLeave}
      onDrop={isUploading ? undefined : onDrop}
      onClick={isUploading ? undefined : onClick}
      onContextMenu={isUploading || hideActions ? undefined : (e) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
      className={`group bg-frame-card border rounded-xl overflow-hidden transition-all ${
        isUploading
          ? 'opacity-60 border-frame-border'
          : isDropTarget
          ? 'border-frame-accent ring-2 ring-frame-accent bg-frame-accent/10 cursor-pointer'
          : isSelected
          ? 'border-frame-accent ring-1 ring-frame-accent hover:bg-frame-cardHover cursor-pointer'
          : 'border-frame-border hover:border-frame-borderLight hover:bg-frame-cardHover cursor-pointer'
      }`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-black overflow-hidden">
        {asset.type === 'image' && signedUrl ? (
          <Image
            src={signedUrl}
            alt={asset.name}
            fill
            className="object-cover"
            unoptimized
          />
        ) : asset.type === 'video' && thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt={asset.name} className="w-full h-full object-cover" />
        ) : asset.type === 'video' && signedUrl ? (
          // No stored thumbnail — use a video element to show the first frame
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            ref={videoRef}
            src={signedUrl}
            preload="metadata"
            muted
            playsInline
            className="w-full h-full object-cover"
            onLoadedMetadata={handleVideoMetadata}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-frame-bg">
            {asset.type === 'video' ? (
              <Film className="w-10 h-10 text-frame-textMuted" />
            ) : (
              <ImageIcon className="w-10 h-10 text-frame-textMuted" />
            )}
          </div>
        )}

        {/* Selection checkbox */}
        {onToggleSelect && !isUploading && (
          <div
            className={`absolute top-2 left-2 z-10 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            onClick={(e) => { e.stopPropagation(); onToggleSelect(e); }}
          >
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              isSelected ? 'bg-frame-accent border-frame-accent' : 'bg-black/60 border-white/60 backdrop-blur-sm'
            }`}>
              {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
            </div>
          </div>
        )}

        {/* Play button overlay for videos */}
        {asset.type === 'video' && !isUploading && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/30">
              <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
            </div>
          </div>
        )}

        {/* Type badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1">
          <div className="px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-xs text-white flex items-center gap-1">
            {asset.type === 'video' ? (
              <Film className="w-3 h-3" />
            ) : (
              <ImageIcon className="w-3 h-3" />
            )}
            {asset.type}
          </div>
          <div className={`px-1.5 py-0.5 backdrop-blur-sm rounded text-xs text-white flex items-center gap-1 font-medium ${
            versionCount > 1 ? 'bg-frame-accent/80' : 'bg-black/60'
          }`}>
            <Layers className="w-3 h-3" />
            V{versionCount}
          </div>
        </div>

        {/* Duration for videos */}
        {asset.type === 'video' && asset.duration && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-xs text-white flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDuration(asset.duration)}
          </div>
        )}

        {/* Uploading overlay */}
        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-center">
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-1" />
              <p className="text-white text-xs">Uploading...</p>
            </div>
          </div>
        )}

        {/* Actions */}
        {!isUploading && !hideActions && (
          <div
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <Dropdown
              trigger={
                <button className="w-7 h-7 bg-black/60 backdrop-blur-sm rounded-lg flex items-center justify-center text-white hover:bg-black/80 transition-colors">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              }
              items={[
                {
                  label: 'Rename',
                  icon: <Pencil className="w-4 h-4" />,
                  onClick: handleRename,
                },
                {
                  label: 'Copy to',
                  icon: <Copy className="w-4 h-4" />,
                  onClick: openCopyTo,
                },
                {
                  label: 'Move to',
                  icon: <MoveIcon className="w-4 h-4" />,
                  onClick: () => onRequestMove?.(),
                },
                {
                  label: 'Duplicate',
                  icon: <CopyPlus className="w-4 h-4" />,
                  onClick: handleDuplicate,
                },
                {
                  label: 'Upload new version',
                  icon: <Upload className="w-4 h-4" />,
                  onClick: handleUploadVersion,
                },
                {
                  label: 'Manage version stack',
                  icon: <Layers className="w-4 h-4" />,
                  onClick: () => setShowVersionModal(true),
                },
                {
                  label: 'Download',
                  icon: <Download className="w-4 h-4" />,
                  onClick: handleDownload,
                },
                {
                  label: 'Approved',
                  icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
                  onClick: () => handleSetStatus('approved'),
                  divider: true,
                },
                {
                  label: 'Needs Revision',
                  icon: <AlertCircle className="w-4 h-4 text-yellow-400" />,
                  onClick: () => handleSetStatus('needs_revision'),
                },
                {
                  label: 'In Review',
                  icon: <Clock className="w-4 h-4 text-blue-400" />,
                  onClick: () => handleSetStatus('in_review'),
                },
                {
                  label: 'Clear status',
                  icon: <X className="w-4 h-4 text-frame-textMuted" />,
                  onClick: () => handleSetStatus(null),
                },
                {
                  label: 'Delete',
                  icon: <Trash2 className="w-4 h-4" />,
                  onClick: handleDelete,
                  danger: true,
                  divider: true,
                },
              ]}
            />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="w-full bg-frame-bg border border-frame-accent rounded px-1.5 py-0.5 text-sm font-medium text-white outline-none focus:ring-1 focus:ring-frame-accent"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
              if (e.key === 'Escape') { setIsRenaming(false); }
            }}
            onBlur={commitRename}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <p className="text-sm font-medium text-white truncate" title={asset.name}>
            {asset.name}
          </p>
        )}
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-frame-textMuted">{formatBytes(asset.size)}</p>
          <div className="flex items-center gap-2">
            {commentCount > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-frame-textMuted">
                <MessageSquare className="w-3 h-3" />
                {commentCount > 99 ? '99+' : commentCount}
              </span>
            )}
            {versionCount > 1 && (
              <p className="text-xs text-frame-accent font-medium">{versionCount} versions</p>
            )}
          </div>
        </div>
        {asset.reviewStatus && (
          <div className="mt-1">
            <ReviewStatusBadge status={asset.reviewStatus} />
          </div>
        )}
      </div>
    </div>
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
          onDeleted={onDeleted}
          getIdToken={getIdToken}
        />
      )}
      {contextMenu && !hideActions && (
        <ContextMenu
          position={contextMenu}
          onClose={() => setContextMenu(null)}
          items={[
            { label: 'Open', icon: <ExternalLink className="w-4 h-4" />, onClick: () => onClick?.() },
            { label: 'Rename', icon: <Pencil className="w-4 h-4" />, onClick: handleRename },
            { label: 'Duplicate', icon: <CopyPlus className="w-4 h-4" />, onClick: handleDuplicate },
            { label: 'Copy to', icon: <Copy className="w-4 h-4" />, onClick: openCopyTo },
            { label: 'Move to', icon: <MoveIcon className="w-4 h-4" />, onClick: () => onRequestMove?.() },
            { label: 'Download', icon: <Download className="w-4 h-4" />, onClick: handleDownload },
            { label: 'Get link', icon: <LinkIcon className="w-4 h-4" />, onClick: handleGetLink },
            { label: 'Approved', icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />, onClick: () => handleSetStatus('approved'), dividerBefore: true },
            { label: 'Needs Revision', icon: <AlertCircle className="w-4 h-4 text-yellow-400" />, onClick: () => handleSetStatus('needs_revision') },
            { label: 'In Review', icon: <Clock className="w-4 h-4 text-blue-400" />, onClick: () => handleSetStatus('in_review') },
            { label: 'Clear status', icon: <X className="w-4 h-4 text-frame-textMuted" />, onClick: () => handleSetStatus(null) },
            { label: 'Delete', icon: <Trash2 className="w-4 h-4" />, onClick: handleDelete, danger: true, dividerBefore: true },
          ]}
        />
      )}
    </>
  );
});

// ── VersionStackModal ─────────────────────────────────────────────────────────

interface VersionStackModalProps {
  asset: Asset;
  onClose: () => void;
  onDeleted?: () => void;
  getIdToken: () => Promise<string | null>;
}

function VersionStackModal({ asset, onClose, onDeleted, getIdToken }: VersionStackModalProps) {
  const [versions, setVersions] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const fetchVersions = async () => {
    setLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/assets/${asset.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions);
      }
    } catch {
      toast.error('Failed to load versions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatDate = (createdAt: Asset['createdAt']) => {
    const date =
      typeof createdAt?.toDate === 'function'
        ? createdAt.toDate()
        : new Date((createdAt as any)?._seconds * 1000 || Date.now());
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const handleDelete = async (version: Asset) => {
    if (!confirm(`Delete version V${version.version}?`)) return;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/assets/${version.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success('Version deleted');
        const remaining = versions.filter((v) => v.id !== version.id);
        setVersions(remaining);
        if (remaining.length === 0 || version.id === asset.id) {
          onDeleted?.();
          onClose();
        }
      } else {
        toast.error('Delete failed');
      }
    } catch {
      toast.error('Delete failed');
    }
  };

  const handleUnstack = async (version: Asset) => {
    try {
      const token = await getIdToken();
      const res = await fetch('/api/assets/unstack-version', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ assetId: version.id }),
      });
      if (res.ok) {
        toast.success(`V${version.version} unstacked`);
        const remaining = versions.filter((v) => v.id !== version.id);
        setVersions(remaining);
        if (version.id === asset.id || remaining.length <= 1) {
          onDeleted?.();
          onClose();
        } else {
          onDeleted?.();
        }
      } else {
        const data = await res.json();
        toast.error(data.error || 'Unstack failed');
      }
    } catch {
      toast.error('Unstack failed');
    }
  };

  const handleReorder = async (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const reordered = [...versions];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setVersions(reordered); // optimistic update

    try {
      const token = await getIdToken();
      const res = await fetch('/api/assets/reorder-versions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderedIds: reordered.map((v) => v.id) }),
      });
      if (!res.ok) {
        toast.error('Reorder failed');
        fetchVersions(); // rollback to server state
      }
    } catch {
      toast.error('Reorder failed');
      fetchVersions(); // rollback to server state
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-frame-card border border-frame-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-frame-border">
          <h3 className="text-sm font-semibold text-white">Version stack</h3>
          <button onClick={onClose} className="text-frame-textMuted hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-80 overflow-y-auto py-2">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-frame-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : versions.length === 0 ? (
            <p className="text-center text-sm text-frame-textMuted py-8">No versions found.</p>
          ) : (
            versions.map((version, idx) => (
              <div
                key={version.id}
                draggable={versions.length > 1}
                onDragStart={(e) => {
                  setDragIdx(idx);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setHoverIdx(idx);
                }}
                onDragLeave={() => setHoverIdx(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIdx !== null) handleReorder(dragIdx, idx);
                  setDragIdx(null);
                  setHoverIdx(null);
                }}
                onDragEnd={() => {
                  setDragIdx(null);
                  setHoverIdx(null);
                }}
                className={`flex items-center gap-3 px-5 py-3 hover:bg-frame-border/30 transition-colors ${
                  hoverIdx === idx && dragIdx !== null && dragIdx !== idx ? 'border-t-2 border-frame-accent' : ''
                } ${dragIdx === idx ? 'opacity-50' : ''}`}
              >
                {/* Drag handle — only when >1 version */}
                {versions.length > 1 && (
                  <GripVertical className="w-4 h-4 text-frame-textMuted cursor-grab flex-shrink-0" />
                )}
                {/* Version badge */}
                <span className="flex-shrink-0 bg-frame-accent/20 text-frame-accent text-xs px-2 py-0.5 rounded font-mono">
                  V{idx + 1}
                </span>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{version.name}</p>
                  <p className="text-xs text-frame-textMuted">
                    {formatDate(version.createdAt)} &middot; {version.uploadedBy}
                  </p>
                </div>
                {/* Action buttons — Unstack + Delete (hidden when only 1 version) */}
                {versions.length > 1 && (
                  <>
                    <button
                      onClick={() => handleUnstack(version)}
                      className="flex-shrink-0 text-frame-textMuted hover:text-white transition-colors"
                      title={`Unstack V${version.version}`}
                    >
                      <Unlink className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(version)}
                      className="flex-shrink-0 text-red-400 hover:text-red-300 transition-colors"
                      title={`Delete V${version.version}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-frame-border">
          <button
            onClick={onClose}
            className="w-full mt-2 py-2 text-sm text-frame-textMuted hover:text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SmartCopyModal ────────────────────────────────────────────────────────────

function SmartCopyModal({
  folders,
  versionCount,
  onPick,
  onClose,
}: {
  folders: Folder[];
  versionCount: number;
  onPick: (folderId: string | null, latestVersionOnly: boolean) => void;
  onClose: () => void;
}) {
  const [latestVersionOnly, setLatestVersionOnly] = useState(versionCount > 1);

  const buildTree = (parentId: string | null, depth: number): { folder: Folder; depth: number }[] => {
    const children = folders.filter((f) => (f.parentId ?? null) === parentId);
    const result: { folder: Folder; depth: number }[] = [];
    for (const child of children) {
      result.push({ folder: child, depth });
      result.push(...buildTree(child.id, depth + 1));
    }
    return result;
  };
  const tree = buildTree(null, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-frame-card border border-frame-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-frame-border">
          <h3 className="text-sm font-semibold text-white">Copy to folder</h3>
          <button onClick={onClose} className="text-frame-textMuted hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {versionCount > 1 && (
          <div className="px-5 py-3 border-b border-frame-border flex items-center justify-between">
            <span className="text-sm text-white">Latest version only</span>
            <button
              onClick={() => setLatestVersionOnly(!latestVersionOnly)}
              className={`w-9 h-5 rounded-full transition-colors relative ${latestVersionOnly ? 'bg-frame-accent' : 'bg-frame-border'}`}
            >
              <span className={`block w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${latestVersionOnly ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </div>
        )}

        <div className="max-h-56 overflow-y-auto py-2">
          <button
            onClick={() => onPick(null, latestVersionOnly)}
            className="w-full flex items-center gap-2 px-5 py-2.5 text-sm text-frame-textSecondary hover:text-white hover:bg-frame-border/50 transition-colors text-left"
          >
            <Home className="w-4 h-4 flex-shrink-0" />
            <span>Project root</span>
          </button>
          {tree.map(({ folder, depth }) => (
            <button
              key={folder.id}
              onClick={() => onPick(folder.id, latestVersionOnly)}
              className="w-full flex items-center gap-2 px-5 py-2.5 text-sm text-frame-textSecondary hover:text-white hover:bg-frame-border/50 transition-colors text-left"
              style={{ paddingLeft: `${20 + depth * 16}px` }}
            >
              <FolderIcon className="w-4 h-4 flex-shrink-0 text-frame-accent" />
              <span className="truncate">{folder.name}</span>
            </button>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-frame-border">
          <p className="text-xs text-frame-textMuted flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            Comments are not copied to the destination folder.
          </p>
        </div>
      </div>
    </div>
  );
}
