'use client';

import { useParams } from 'next/navigation';
import { useAsset } from '@/hooks/useAssets';
import { useComments } from '@/hooks/useComments';
import { VideoPlayer, VideoPlayerHandle } from '@/components/viewer/VideoPlayer';
import { ImageViewer, ImageViewerHandle } from '@/components/viewer/ImageViewer';
import { CommentSidebar } from '@/components/viewer/CommentSidebar';
import { Spinner } from '@/components/ui/Spinner';
import { useProject } from '@/hooks/useProject';
import Link from 'next/link';
import { ChevronLeft, Share2, Download, CheckCircle2, AlertCircle, Clock, X, Tag } from 'lucide-react';
import { forceDownload } from '@/lib/utils';
import { useState, useCallback, useRef, useEffect } from 'react';
import { CreateReviewLinkModal } from '@/components/review/CreateReviewLinkModal';
import { ExportModal } from '@/components/viewer/ExportModal';
import { VersionSwitcher } from '@/components/viewer/VersionSwitcher';
import { VersionComparison } from '@/components/viewer/VersionComparison';
import type { Comment, Asset } from '@/types';
import type { ReviewStatus } from '@/types';
import { ReviewStatusBadge } from '@/components/ui/ReviewStatusBadge';
import { Dropdown } from '@/components/ui/Dropdown';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';

export default function AssetViewerPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const assetId = params.assetId as string;
  const { asset, versions, loading } = useAsset(assetId);
  const { project } = useProject(projectId);
  const { getIdToken } = useAuth();
  const [activeVersion, setActiveVersion] = useState<Asset | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const displayAsset = activeVersion || asset;
  const { comments, addComment, resolveComment, deleteComment, editComment } = useComments(displayAsset?.id);
  const [currentTime, setCurrentTime] = useState(0);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const videoRef = useRef<VideoPlayerHandle>(null);
  const imageRef = useRef<ImageViewerHandle>(null);

  // Annotation state
  const [isAnnotationMode, setIsAnnotationMode] = useState(false);
  const [pendingAnnotation, setPendingAnnotation] = useState<string | null>(null);
  const [activeAnnotationCommentId, setActiveAnnotationCommentId] = useState<string | null>(null);
  const [displayShapes, setDisplayShapes] = useState<string | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);

  // In/out range — lifted from CommentSidebar so VideoPlayer can loop on the same values.
  const [rangeIn, setRangeIn] = useState<number | undefined>(undefined);
  const [rangeOut, setRangeOut] = useState<number | undefined>(undefined);

  // Sync activeVersion when asset loads or URL changes
  useEffect(() => {
    if (asset) setActiveVersion(asset);
  }, [asset]);

  // Clear composer/annotation state whenever the displayed asset changes so a
  // drawing or selection captured for Asset A cannot leak into Asset B.
  useEffect(() => {
    setIsAnnotationMode(false);
    setPendingAnnotation(null);
    setActiveAnnotationCommentId(null);
    setDisplayShapes(null);
    setSelectedCommentId(null);
    setRangeIn(undefined);
    setRangeOut(undefined);
  }, [displayAsset?.id]);

  const handleRequestAnnotation = useCallback(() => {
    if (displayAsset?.type === 'video') {
      videoRef.current?.pause();
    }
    // Clear any displayed annotation first, THEN enter drawing mode
    // so the canvas resets before isAnnotationMode=true triggers the drawing layer
    setActiveAnnotationCommentId(null);
    setDisplayShapes(null);
    setPendingAnnotation(null);
    setIsAnnotationMode(true);
  }, [displayAsset?.type]);

  const handleAnnotationCapture = useCallback((shapes: string) => {
    setPendingAnnotation(shapes);
    setIsAnnotationMode(false);
  }, []);

  const handleAnnotationCancel = useCallback(() => {
    setIsAnnotationMode(false);
  }, []);

  const handleClearAnnotation = useCallback(() => {
    setPendingAnnotation(null);
  }, []);

  const handleCaptureAnnotationFromSidebar = useCallback((): string | null => {
    let shapes: string | null = null;
    if (displayAsset?.type === 'video') {
      shapes = videoRef.current?.captureAnnotation() ?? null;
    } else {
      shapes = imageRef.current?.captureAnnotation() ?? null;
    }
    // Exit annotation mode now that we've captured
    setIsAnnotationMode(false);
    return shapes;
  }, [displayAsset?.type]);

  // Show annotation from a comment: seek to its frame, display shapes
  const handleShowAnnotation = useCallback((commentId: string, shapes: string, timestamp?: number) => {
    setActiveAnnotationCommentId(commentId);
    setDisplayShapes(shapes);
    setIsAnnotationMode(false);
    setPendingAnnotation(null);
    if (timestamp !== undefined && displayAsset?.type === 'video') {
      videoRef.current?.seekTo(timestamp);
      videoRef.current?.pause();
    }
  }, [displayAsset?.type]);

  const handleHideAnnotation = useCallback(() => {
    setActiveAnnotationCommentId(null);
    setDisplayShapes(null);
  }, []);

  // Clicking a timeline marker: seek + show annotation + highlight in sidebar
  const handleCommentClickFromTimeline = useCallback((comment: Comment) => {
    if (comment.timestamp !== undefined) {
      videoRef.current?.seekTo(comment.timestamp);
      videoRef.current?.pause();
    }
    // Always reset annotation state first, then set only if this comment has one
    setIsAnnotationMode(false);
    if (comment.annotation?.shapes && comment.annotation.shapes !== '[]') {
      setActiveAnnotationCommentId(comment.id);
      setDisplayShapes(comment.annotation.shapes);
    } else {
      setActiveAnnotationCommentId(null);
      setDisplayShapes(null);
    }
    setSelectedCommentId(comment.id);
  }, []);

  const handleSeek = useCallback((time: number) => {
    videoRef.current?.seekTo(time);
    videoRef.current?.pause();
  }, []);

  // User manually interacted with the video (play/scrub/step) → clear displayed annotation
  const handleUserInteraction = useCallback(() => {
    if (activeAnnotationCommentId) {
      setActiveAnnotationCommentId(null);
      setDisplayShapes(null);
    }
  }, [activeAnnotationCommentId]);

  const handleSetStatus = async (reviewStatus: ReviewStatus | null) => {
    if (!displayAsset) return;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/assets/${displayAsset.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reviewStatus }),
      });
      if (res.ok) {
        setActiveVersion((prev) => prev ? { ...prev, reviewStatus: reviewStatus ?? undefined } as Asset : prev);
        toast.success(reviewStatus ? 'Status updated' : 'Status cleared');
      } else {
        toast.error('Failed to update status');
      }
    } catch {
      toast.error('Failed to update status');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <p className="text-frame-textSecondary text-lg font-medium">Asset not found</p>
        <Link href={`/projects/${projectId}`} className="mt-4 text-sm text-frame-accent hover:underline">
          Back to project
        </Link>
      </div>
    );
  }

  const backHref = asset.folderId
    ? `/projects/${projectId}/folders/${asset.folderId}`
    : `/projects/${projectId}`;


  return (
    <div className="flex flex-col h-screen bg-frame-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-frame-border flex-shrink-0 gap-4 bg-frame-sidebar">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href={backHref}
            className="flex items-center gap-1.5 text-frame-textSecondary hover:text-white transition-colors flex-shrink-0 text-xs font-medium px-2 py-1.5 rounded-lg hover:bg-frame-cardHover"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>{project?.name || 'Project'}</span>
          </Link>
          <span className="text-frame-border text-xs">/</span>
          <h1 className="text-sm font-semibold text-white truncate">{asset.name}</h1>
          <ReviewStatusBadge status={displayAsset?.reviewStatus} />
          <Dropdown
            trigger={
              <button className="flex items-center gap-1 text-frame-textSecondary hover:text-white transition-colors text-xs px-1.5 py-1 rounded-lg hover:bg-frame-cardHover flex-shrink-0" title="Set review status">
                <Tag className="w-3 h-3" />
              </button>
            }
            align="left"
            items={[
              {
                label: 'Approved',
                icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
                onClick: () => handleSetStatus('approved'),
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
                divider: true,
              },
            ]}
          />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {versions.length > 1 && displayAsset && (
            <VersionSwitcher
              versions={versions}
              activeVersionId={displayAsset.id}
              onSelectVersion={(v) => { setActiveVersion(v); setCompareMode(false); setDisplayShapes(null); setActiveAnnotationCommentId(null); setIsAnnotationMode(false); }}
              compareMode={compareMode}
              onToggleCompare={() => {
                setCompareMode((v) => !v);
                // Compare mode renders differently — clear any annotation overlay
                // so it doesn't stay pinned to the wrong coordinates
                setDisplayShapes(null);
                setActiveAnnotationCommentId(null);
                setIsAnnotationMode(false);
              }}
            />
          )}
          {displayAsset?.status === 'ready' && (
            <button
              onClick={() => {
                const url = (displayAsset as any).downloadUrl ?? (displayAsset as any).signedUrl;
                if (url) forceDownload(url, displayAsset.name);
              }}
              className="flex items-center gap-1.5 text-frame-textSecondary hover:text-white transition-colors flex-shrink-0 text-xs font-medium px-2 py-1.5 rounded-lg hover:bg-frame-cardHover"
              title="Download"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
          )}
          <button
            onClick={() => setShowReviewModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white bg-frame-accent hover:bg-frame-accentHover rounded-xl transition-colors shadow-sm shadow-frame-accent/20"
          >
            <Share2 className="w-3.5 h-3.5" />
            Share
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Video/image area — swaps between player and comparison */}
        <div className="flex-1 bg-black overflow-hidden">
          {compareMode && versions.length >= 2 ? (
            <VersionComparison versions={versions} />
          ) : displayAsset && displayAsset.type === 'video' ? (
            <VideoPlayer
              key={displayAsset.id}
              ref={videoRef}
              asset={displayAsset}
              comments={comments}
              onTimeUpdate={setCurrentTime}
              onUserInteraction={handleUserInteraction}
              isAnnotationMode={isAnnotationMode}
              displayShapes={displayShapes}
              onRequestAnnotation={handleRequestAnnotation}
              onAnnotationCapture={handleAnnotationCapture}
              onAnnotationCancel={handleAnnotationCancel}
              onCommentClick={handleCommentClickFromTimeline}
              onAnnotationStarted={() => window.dispatchEvent(new CustomEvent('focus-comment-input'))}
              onRequestExport={() => setShowExportModal(true)}
              loopIn={rangeIn}
              loopOut={rangeOut}
              onLoopInChange={setRangeIn}
              onLoopOutChange={setRangeOut}
            />
          ) : displayAsset ? (
            <ImageViewer
              key={displayAsset.id}
              ref={imageRef}
              asset={displayAsset}
              comments={comments}
              isAnnotationMode={isAnnotationMode}
              onAnnotationCapture={handleAnnotationCapture}
              onAnnotationCancel={handleAnnotationCancel}
              displayShapes={displayShapes}
            />
          ) : null}
        </div>

        <CommentSidebar
          asset={displayAsset || asset}
          comments={comments}
          currentTime={currentTime}
          projectId={projectId}
          isAnnotationMode={isAnnotationMode}
          pendingAnnotation={pendingAnnotation}
          onRequestAnnotation={handleRequestAnnotation}
          onCaptureAnnotation={handleCaptureAnnotationFromSidebar}
          onClearAnnotation={handleClearAnnotation}
          activeAnnotationCommentId={activeAnnotationCommentId}
          selectedCommentId={selectedCommentId}
          onShowAnnotation={handleShowAnnotation}
          onHideAnnotation={handleHideAnnotation}
          onAddComment={addComment}
          onResolveComment={resolveComment}
          onDeleteComment={deleteComment}
          onEditComment={editComment}
          onSeek={handleSeek}
          onSelectComment={setSelectedCommentId}
          inPoint={rangeIn}
          outPoint={rangeOut}
          onInPointChange={setRangeIn}
          onOutPointChange={setRangeOut}
        />
      </div>

      {showReviewModal && (
        <CreateReviewLinkModal projectId={projectId} onClose={() => setShowReviewModal(false)} />
      )}
      {displayAsset && displayAsset.type === 'video' && (
        <ExportModal
          asset={displayAsset}
          open={showExportModal}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}
