'use client';

import Image from 'next/image';
import { useRef, useCallback, useState, useEffect, memo } from 'react';
import { Play, Image as ImageIcon, Film, MoreHorizontal, Trash2, Clock, Upload, Layers, Check, Pencil, Copy, CopyPlus, X, ExternalLink, Move as MoveIcon, Download, Link as LinkIcon, MessageSquare, CheckCircle2, AlertCircle } from 'lucide-react';
import { formatDuration, formatBytes, forceDownload } from '@/lib/utils';
import type { Asset, Folder } from '@/types';
import type { ReviewStatus } from '@/types';
import { Dropdown } from '@/components/ui/Dropdown';
import { ContextMenu } from '@/components/ui/ContextMenu';
import type { MenuItem } from '@/components/ui/ContextMenu';
import { ReviewStatusBadge } from '@/components/ui/ReviewStatusBadge';
import { SmartCopyModal } from './SmartCopyModal';
import { VersionStackModal } from './VersionStackModal';
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
  onCreateReviewLink?: () => void;
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
  onRequestMove, onCreateReviewLink, isSelected, onToggleSelect, onDragStart, hideActions,
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
  const [isHovering, setIsHovering] = useState(false);
  const [scrubPct, setScrubPct] = useState(0);
  const [spriteLoaded, setSpriteLoaded] = useState(false);
  const [lazySpriteUrl, setLazySpriteUrl] = useState<string | null>(null);
  const [generatingSprite, setGeneratingSprite] = useState(false);
  const serverSpriteUrl = (asset as any).spriteSignedUrl as string | undefined;
  const spriteUrl = serverSpriteUrl || lazySpriteUrl;

  // When a video element loads its metadata, seek to a non-black frame
  const handleVideoMetadata = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const seekTo = Math.min((vid.duration || 0) * 0.1, 2) || 1;
    vid.currentTime = seekTo;
  }, []);

  const handleHoverScrub = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setScrubPct(pct);
  }, []);

  const ensureSprite = useCallback(async () => {
    if (spriteUrl || generatingSprite || asset.type !== 'video') return;
    setGeneratingSprite(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/assets/${asset.id}/generate-sprite`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.spriteStripUrl) setLazySpriteUrl(data.spriteStripUrl);
        else console.warn('[sprite] no URL in response', data);
      } else {
        const text = await res.text();
        console.warn('[sprite] generation failed', res.status, text);
      }
    } catch (err) {
      console.warn('[sprite] request error', err);
    } finally {
      setGeneratingSprite(false);
    }
  }, [spriteUrl, generatingSprite, asset.type, asset.id, getIdToken]);

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

  const uploadDate: Date | null =
    typeof (asset.createdAt as any)?.toDate === 'function'
      ? (asset.createdAt as any).toDate()
      : (asset.createdAt as any)?._seconds
      ? new Date((asset.createdAt as any)._seconds * 1000)
      : null;
  const uploadDateLabel = uploadDate
    ? uploadDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ', ' +
      uploadDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';

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
      <div
        className="relative aspect-video bg-black overflow-hidden"
        onMouseEnter={asset.type === 'video' && signedUrl ? () => { setIsHovering(true); setScrubPct(0); ensureSprite(); } : undefined}
        onMouseLeave={asset.type === 'video' && signedUrl ? () => setIsHovering(false) : undefined}
        onMouseMove={asset.type === 'video' && isHovering && spriteLoaded ? handleHoverScrub : undefined}
      >
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

        {/* Preload sprite strip image (hidden) */}
        {asset.type === 'video' && spriteUrl && !spriteLoaded && (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img
            src={spriteUrl}
            onLoad={() => setSpriteLoaded(true)}
            className="hidden"
          />
        )}

        {/* Sprite strip hover overlay — pure CSS, no video decoding */}
        {asset.type === 'video' && spriteUrl && isHovering && spriteLoaded && (
          <div
            className="absolute inset-0 z-[1] bg-black"
            style={{
              backgroundImage: `url(${spriteUrl})`,
              backgroundSize: `${20 * 100}% 100%`,
              backgroundPosition: `${(Math.min(Math.floor(scrubPct * 20), 19) / 19) * 100}% 0`,
              backgroundRepeat: 'no-repeat',
            }}
          />
        )}

        {/* Scrub progress bar */}
        {asset.type === 'video' && isHovering && spriteLoaded && (
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/40 z-[2]">
            <div
              className="h-full bg-frame-accent"
              style={{ width: `${scrubPct * 100}%` }}
            />
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

        {/* Review status badge — bottom-left of thumbnail */}
        {asset.reviewStatus && (
          <div className="absolute bottom-2 left-2">
            <ReviewStatusBadge status={asset.reviewStatus} />
          </div>
        )}

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
        {uploadDateLabel && (
          <div className="flex items-center gap-1 mt-0.5">
            <Clock className="w-3 h-3 text-frame-textMuted flex-shrink-0" />
            <p className="text-xs text-frame-textMuted">{uploadDateLabel}</p>
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
            { label: 'Upload new version', icon: <Upload className="w-4 h-4" />, onClick: handleUploadVersion },
            { label: 'Manage version stack', icon: <Layers className="w-4 h-4" />, onClick: () => setShowVersionModal(true) },
            { label: 'Download', icon: <Download className="w-4 h-4" />, onClick: handleDownload },
            { label: 'Get link', icon: <LinkIcon className="w-4 h-4" />, onClick: handleGetLink },
            ...(onCreateReviewLink ? [{ label: 'Create review link', icon: <LinkIcon className="w-4 h-4" />, onClick: onCreateReviewLink }] : []),
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


