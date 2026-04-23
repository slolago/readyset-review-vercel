'use client';

import Image from 'next/image';
import { useRef, useCallback, useState, useEffect, memo } from 'react';
import { Play, Image as ImageIcon, Film, MoreHorizontal, Trash2, Clock, Upload, Layers, Check, Pencil, Copy, CopyPlus, X, ExternalLink, Move as MoveIcon, Download, Link as LinkIcon, MessageSquare, CheckCircle2, AlertCircle, FileText, FileCode, FileArchive, Type, Palette } from 'lucide-react';
import { formatDuration, formatBytes, forceDownload } from '@/lib/utils';
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
import type { Asset, Folder } from '@/types';
import type { ReviewStatus } from '@/types';
import { Dropdown } from '@/components/ui/Dropdown';
import { RatingStars } from '@/components/ui/RatingStars';
import { useContextMenuController } from '@/components/ui/ContextMenu';
import { useRenameController } from './FolderBrowser';
import { buildFileBrowserActions } from './fileBrowserActions';
import { ReviewStatusBadge } from '@/components/ui/ReviewStatusBadge';
import dynamic from 'next/dynamic';
import { ModalSkeleton } from '@/components/ui/ModalSkeleton';
import { SmartCopyModal } from './SmartCopyModal';
import { StackOntoModal } from './StackOntoModal';

const VersionStackModal = dynamic(
  () => import('./VersionStackModal').then((m) => m.VersionStackModal),
  { ssr: false, loading: () => <ModalSkeleton /> }
);
import { useAuth } from '@/hooks/useAuth';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { InlineRename } from '@/components/ui/InlineRename';
import { useUpload } from '@/hooks/useAssets';
import { useAssetJobs } from '@/hooks/useAssetJobs';
import { selectionStyle, type SelectionState } from '@/lib/selectionStyle';
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
  onAddToReviewLink?: () => void;
  isSelected?: boolean;
  onToggleSelect?: (e: React.MouseEvent) => void;
  onDragStart?: (e: React.DragEvent) => void;
  hideActions?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  isDropTarget?: boolean;
  /** Sibling assets in the same folder — used for the "Stack onto…" picker. */
  folderSiblings?: Asset[];
}

export const AssetCard = memo(function AssetCard({
  asset, onClick, onDeleted, onVersionUploaded, onCopied, onDuplicated,
  onRequestMove, onCreateReviewLink, onAddToReviewLink, isSelected, onToggleSelect, onDragStart, hideActions,
  onDragOver, onDragLeave, onDrop, isDropTarget, folderSiblings
}: AssetCardProps) {
  const { getIdToken } = useAuth();
  const confirm = useConfirm();
  const { uploadFile } = useUpload();
  const ctxMenu = useContextMenuController();
  const { activeId, setActiveId } = useRenameController();
  const myRenameKey = `asset-${asset.id}`;
  const isRenaming = activeId === myRenameKey;
  const closeRename = () => { if (activeId === myRenameKey) setActiveId(null); };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const versionCount = (asset as any)._versionCount || 1;
  const commentCount = ((asset as any)._commentCount as number | undefined) ?? 0;
  const [showCopyToModal, setShowCopyToModal] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [showStackOntoModal, setShowStackOntoModal] = useState(false);
  const [allFolders, setAllFolders] = useState<Folder[]>([]);
  const signedUrl = (asset as any).signedUrl as string | undefined;
  const thumbnailUrl = (asset as any).thumbnailSignedUrl as string | undefined;
  const downloadUrl = (asset as any).downloadUrl as string | undefined;
  const [isHovering, setIsHovering] = useState(false);
  const [scrubPct, setScrubPct] = useState(0);
  const [spriteLoaded, setSpriteLoaded] = useState(false);
  const [lazySpriteUrl, setLazySpriteUrl] = useState<string | null>(null);
  const [generatingSprite, setGeneratingSprite] = useState(false);
  const [spriteFailed, setSpriteFailed] = useState(false);
  const serverSpriteUrl = (asset as any).spriteSignedUrl as string | undefined;
  const spriteUrl = serverSpriteUrl || lazySpriteUrl;

  // Phase 60 (OBS-01): live pipeline state on video cards.
  // Amber dot while any job is running, red dot when a job has failed.
  const { jobs, refetch: refetchJobs } = useAssetJobs(asset.id, asset.type === 'video' && asset.status !== 'uploading');
  const runningJob = jobs.find((j) => j.status === 'running' || j.status === 'queued');
  const failedJob = jobs.find((j) => j.status === 'failed');
  const indicatorState: 'running' | 'failed' | null =
    failedJob ? 'failed' : runningJob ? 'running' : null;
  const indicatorTooltip = failedJob
    ? `${failedJob.type} failed${failedJob.error ? `: ${failedJob.error}` : ''} — click to retry`
    : runningJob
    ? `${runningJob.type} ${runningJob.status}…`
    : '';

  const handleRetryFailedJob = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!failedJob) return;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/jobs/${failedJob.id}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success(`Retrying ${failedJob.type}…`);
        refetchJobs();
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ? `Retry failed: ${data.error}` : 'Retry failed');
      }
    } catch (err) {
      toast.error(`Retry failed: ${(err as Error).message || 'network error'}`);
    }
  }, [failedJob, getIdToken, refetchJobs]);

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

  // Hover-fallback only (OBS-03). The normal pipeline fires sprite generation
  // server-side from /api/upload/complete; this keeps pre-Phase-60 assets
  // without a sprite working — first hover triggers generation on demand.
  const ensureSprite = useCallback(async () => {
    // Don't retry after a failure — would hammer the server on every hover.
    // User can refresh to try again.
    if (spriteUrl || generatingSprite || spriteFailed || asset.type !== 'video') return;
    setGeneratingSprite(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/assets/${asset.id}/generate-sprite`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.spriteSignedUrl) setLazySpriteUrl(data.spriteSignedUrl);
        else { console.warn('[sprite] no URL in response', data); setSpriteFailed(true); }
      } else {
        const data = await res.json().catch(() => null);
        console.warn('[sprite] generation failed', res.status, data ?? '(no body)');
        setSpriteFailed(true);
      }
    } catch (err) {
      console.warn('[sprite] request error', err);
      setSpriteFailed(true);
    } finally {
      setGeneratingSprite(false);
    }
  }, [spriteUrl, generatingSprite, spriteFailed, asset.type, asset.id, getIdToken]);

  const handleRename = () => {
    setActiveId(myRenameKey);
  };

  const commitRename = async (trimmed: string) => {
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
        const data = await res.json().catch(() => null);
        toast.error(data?.error ? `Rename failed: ${data.error}` : 'Rename failed');
      }
    } catch (err) {
      toast.error(`Rename failed: ${(err as Error).message || 'network error'}`);
    } finally {
      closeRename();
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
        const data = await res.json().catch(() => null);
        toast.error(data?.error ? `Copy failed: ${data.error}` : 'Copy failed');
      }
    } catch (err) {
      toast.error(`Copy failed: ${(err as Error).message || 'network error'}`);
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
        const data = await res.json().catch(() => null);
        toast.error(data?.error ? `Duplicate failed: ${data.error}` : 'Duplicate failed');
      }
    } catch (err) {
      toast.error(`Duplicate failed: ${(err as Error).message || 'network error'}`);
    }
  };

  const handleStackOnto = async (targetId: string) => {
    setShowStackOntoModal(false);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/assets/merge-version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sourceId: asset.id, targetId }),
      });
      if (res.ok) {
        toast.success('Stacked');
        onDeleted?.(); // reuse refresh callback
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ? `Stack failed: ${data.error}` : 'Stack failed');
      }
    } catch (err) {
      toast.error(`Stack failed: ${(err as Error).message || 'network error'}`);
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
    const ok = await confirm({
      title: `Delete "${asset.name}"?`,
      message: `This will permanently remove the asset${(asset as any)._versionCount > 1 ? ` and all ${(asset as any)._versionCount} versions in its stack` : ''}.\n\nThis cannot be undone.`,
      destructive: true,
    });
    if (!ok) return;
    try {
      const token = await getIdToken();
      // BLK-01: when the card represents a stack (_versionCount > 1), delete every version
      const allVersions = ((asset as any)._versionCount ?? 1) > 1;
      const url = `/api/assets/${asset.id}${allVersions ? '?allVersions=true' : ''}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success(`Deleted "${asset.name}"`);
        onDeleted?.();
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ? `Delete failed: ${data.error}` : 'Failed to delete');
      }
    } catch (err) {
      toast.error(`Failed to delete: ${(err as Error).message || 'network error'}`);
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

  // Unified action list (three-dots dropdown + right-click menu consume this).
  const assetActions = buildFileBrowserActions('asset', {
    onOpen: onClick,
    onRename: handleRename,
    onDuplicate: handleDuplicate,
    onCopyTo: openCopyTo,
    onMoveTo: () => onRequestMove?.(),
    onUploadVersion: handleUploadVersion,
    onStackOnto: () => setShowStackOntoModal(true),
    onManageVersions: () => setShowVersionModal(true),
    onDownload: handleDownload,
    onGetLink: handleGetLink,
    onCreateReviewLink,
    onAddToReviewLink,
    onSetStatus: handleSetStatus,
    onDelete: handleDelete,
    icons: {
      open: <ExternalLink className="w-4 h-4" />,
      rename: <Pencil className="w-4 h-4" />,
      duplicate: <CopyPlus className="w-4 h-4" />,
      copyTo: <Copy className="w-4 h-4" />,
      moveTo: <MoveIcon className="w-4 h-4" />,
      uploadVersion: <Upload className="w-4 h-4" />,
      stackOnto: <Layers className="w-4 h-4" />,
      manageVersions: <Layers className="w-4 h-4" />,
      download: <Download className="w-4 h-4" />,
      getLink: <LinkIcon className="w-4 h-4" />,
      createReviewLink: <LinkIcon className="w-4 h-4" />,
      addToReviewLink: <LinkIcon className="w-4 h-4" />,
      approved: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
      needsRevision: <AlertCircle className="w-4 h-4 text-yellow-400" />,
      inReview: <Clock className="w-4 h-4 text-blue-400" />,
      clearStatus: <X className="w-4 h-4 text-frame-textMuted" />,
      delete: <Trash2 className="w-4 h-4" />,
    },
  });

  return (
    <>
      <input ref={fileInputRef} type="file" accept={FILE_INPUT_ACCEPT} className="hidden" onChange={handleFileSelected} />
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
        ctxMenu.open(`asset-${asset.id}`, { x: e.clientX, y: e.clientY }, assetActions);
      }}
      className={[
        'group bg-frame-card rounded-xl overflow-hidden transition-all',
        isUploading ? 'opacity-70 cursor-wait' : 'cursor-pointer hover:bg-frame-cardHover',
        selectionStyle(
          'asset',
          (isDropTarget || isSelected ? 'selected' : 'idle') as SelectionState
        ),
        // Preserve drop-target ring-2 emphasis so it dominates plain selection.
        isDropTarget ? 'ring-2 ring-frame-accent bg-frame-accent/10' : '',
      ].filter(Boolean).join(' ')}
    >
      {/* Thumbnail */}
      <div
        className="relative aspect-video bg-black overflow-hidden"
        onMouseEnter={asset.type === 'video' && signedUrl ? () => { setIsHovering(true); setScrubPct(0); ensureSprite(); } : undefined}
        onMouseLeave={asset.type === 'video' && signedUrl ? () => setIsHovering(false) : undefined}
        onMouseMove={asset.type === 'video' && isHovering && spriteLoaded ? handleHoverScrub : undefined}
      >
        {/* Phase 60 job indicator — top-left, above existing badges */}
        {indicatorState && (
          indicatorState === 'failed' ? (
            <button
              type="button"
              data-testid="job-indicator-failed"
              title={indicatorTooltip}
              onClick={handleRetryFailedJob}
              className="absolute top-1 left-1 z-20 w-2.5 h-2.5 rounded-full shadow-md ring-1 ring-black/40 hover:scale-125 transition-transform"
              style={{ backgroundColor: '#ef4444' }}
            />
          ) : (
            <div
              data-testid="job-indicator-running"
              title={indicatorTooltip}
              className="absolute top-1 left-1 z-20 w-2.5 h-2.5 rounded-full shadow-md ring-1 ring-black/40 animate-pulse"
              style={{ backgroundColor: '#f59e0b' }}
            />
          )
        )}
        {asset.type === 'image' && signedUrl ? (
          <Image
            src={signedUrl}
            alt={asset.name}
            fill
            className="object-contain"
            unoptimized
          />
        ) : asset.type === 'video' && thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt={asset.name} className="w-full h-full object-contain" />
        ) : asset.type === 'video' && signedUrl ? (
          // No stored thumbnail — use a video element to show the first frame
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            ref={videoRef}
            src={signedUrl}
            preload="metadata"
            muted
            playsInline
            className="w-full h-full object-contain"
            onLoadedMetadata={handleVideoMetadata}
          />
        ) : asset.type !== 'video' && asset.type !== 'image' ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-frame-bg gap-2">
            {(() => {
              const Icon = ICON_COMPONENTS[TYPE_META[asset.type].iconName];
              return <Icon className="w-12 h-12 text-frame-textMuted" />;
            })()}
            {asset.subtype && (
              <span className="px-2 py-0.5 bg-frame-card rounded text-[10px] font-mono uppercase text-frame-textSecondary tracking-wide">
                .{asset.subtype}
              </span>
            )}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-frame-bg">
            {asset.type === 'video' ? (
              <Film className="w-10 h-10 text-frame-textMuted" />
            ) : (
              <ImageIcon className="w-10 h-10 text-frame-textMuted" />
            )}
          </div>
        )}

        {/* Preload sprite strip image (hidden).
            onError: if the signed URL 404s, CORS fails, or the JPG is corrupt,
            spriteLoaded never flipped to true under the old code and the user
            saw nothing (no spinner, no scrub, no feedback). Now we set
            spriteFailed so the user knows something's off and a refresh will
            retry fresh. Also clears the stale lazySpriteUrl so the next
            hover re-requests. */}
        {asset.type === 'video' && spriteUrl && !spriteLoaded && (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img
            src={spriteUrl}
            onLoad={() => setSpriteLoaded(true)}
            onError={() => {
              console.warn('[sprite] preload failed for', asset.id, spriteUrl);
              setSpriteFailed(true);
              setLazySpriteUrl(null);
            }}
            className="hidden"
          />
        )}

        {/* Sprite strip hover overlay — pure CSS, no video decoding.
            pointer-events-none: onMouseMove lives on the parent thumbnail div
            (not this overlay); making the overlay transparent to the mouse
            lets events reach the z-20 three-dots wrapper above and the
            parent handler below via bubbling. */}
        {asset.type === 'video' && spriteUrl && isHovering && spriteLoaded && (
          <div
            className="absolute inset-0 z-[1] bg-black pointer-events-none"
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
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/40 z-[2] pointer-events-none">
            <div
              className="h-full bg-frame-accent"
              style={{ width: `${scrubPct * 100}%` }}
            />
          </div>
        )}

        {/* Loading indicator while sprite is generating */}
        {asset.type === 'video' && isHovering && generatingSprite && !spriteLoaded && (
          <div className="absolute bottom-1 right-1 z-[2] bg-black/70 backdrop-blur-sm rounded-full p-1 pointer-events-none">
            <div className="w-3 h-3 border-2 border-frame-accent border-t-transparent rounded-full animate-spin" />
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
            {(() => {
              const TypeIcon = ICON_COMPONENTS[TYPE_META[asset.type].iconName];
              return <TypeIcon className="w-3 h-3" />;
            })()}
            {TYPE_META[asset.type].label.toLowerCase()}
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
            <div className="bg-black/50 backdrop-blur-sm rounded px-1.5 py-0.5">
              <ReviewStatusBadge status={asset.reviewStatus} />
            </div>
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
            className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <Dropdown
              trigger={
                <button className="w-7 h-7 bg-black/60 backdrop-blur-sm rounded-lg flex items-center justify-center text-white hover:bg-black/80 transition-colors">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              }
              items={assetActions.map((a) => ({
                label: a.label,
                icon: a.icon,
                onClick: a.onClick,
                danger: a.danger,
                divider: a.dividerBefore,
              }))}
            />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        {isRenaming ? (
          <InlineRename
            value={asset.name}
            onCommit={commitRename}
            onCancel={closeRename}
          />
        ) : (
          <p className="text-sm font-medium text-white truncate" title={asset.name}>
            {asset.name}
          </p>
        )}
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-frame-textMuted">{formatBytes(asset.size)}</p>
          <div className="flex items-center gap-2">
            {asset.rating && asset.rating > 0 && (
              <RatingStars value={asset.rating} readOnly size="sm" />
            )}
            {commentCount > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-frame-textMuted">
                <MessageSquare className="w-3 h-3" />
                {commentCount > 99 ? '99+' : commentCount}
              </span>
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
      {showStackOntoModal && (
        <StackOntoModal
          source={asset}
          candidates={folderSiblings ?? []}
          onPick={handleStackOnto}
          onClose={() => setShowStackOntoModal(false)}
        />
      )}
    </>
  );
});


