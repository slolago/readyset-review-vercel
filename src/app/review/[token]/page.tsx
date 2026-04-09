'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Film, Lock, AlertCircle, ChevronLeft, Download } from 'lucide-react';
import type { ReviewLink, Asset, Folder, Comment } from '@/types';
import { forceDownload } from '@/lib/utils';
import { AssetCard } from '@/components/files/AssetCard';
import { ReviewHeader } from '@/components/review/ReviewHeader';
import { ReviewGuestForm } from '@/components/review/ReviewGuestForm';
import { CommentSidebar } from '@/components/viewer/CommentSidebar';
import { VideoPlayer, VideoPlayerHandle } from '@/components/viewer/VideoPlayer';
import { ImageViewer, ImageViewerHandle } from '@/components/viewer/ImageViewer';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/hooks/useAuth';

interface ReviewData {
  reviewLink: ReviewLink;
  assets: Asset[];
  folders: Folder[];
  projectName: string;
}

export default function ReviewPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [guestInfo, setGuestInfo] = useState<{ name: string; email: string } | null>(() => {
    if (typeof window === 'undefined') return null;
    const saved = localStorage.getItem('frame_guest_name');
    return saved ? { name: saved, email: '' } : null;
  });
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [currentTime, setCurrentTime] = useState(0);

  // Annotation state — same pattern as the internal asset viewer
  const videoRef = useRef<VideoPlayerHandle>(null);
  const imageRef = useRef<ImageViewerHandle>(null);
  const [isAnnotationMode, setIsAnnotationMode] = useState(false);
  const [pendingAnnotation, setPendingAnnotation] = useState<string | null>(null);
  const [activeAnnotationCommentId, setActiveAnnotationCommentId] = useState<string | null>(null);
  const [displayShapes, setDisplayShapes] = useState<string | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);

  const { user, loading: authLoading } = useAuth();

  const fetchReview = async (pwd?: string) => {
    try {
      const qs = new URLSearchParams();
      if (pwd) qs.set('password', pwd);
      const res = await fetch(`/api/review-links/${token}?${qs}`);
      if (res.status === 401) { setPasswordError(true); setLoading(false); return; }
      if (!res.ok) throw new Error('Review link not found or expired');
      const json = await res.json();
      setData(json);
      setPasswordError(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load review');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchReview(); }, [token]);

  useEffect(() => {
    if (!authLoading && user) {
      setGuestInfo({ name: user.name, email: user.email });
    }
  }, [authLoading, user]);

  const fetchComments = useCallback(async (assetId: string) => {
    const res = await fetch(`/api/comments?assetId=${assetId}&reviewToken=${token}`);
    if (res.ok) {
      const json = await res.json();
      setComments(json.comments);
    }
  }, [token]);

  const handleSelectAsset = async (asset: Asset) => {
    setSelectedAsset(asset);
    setIsAnnotationMode(false);
    setPendingAnnotation(null);
    setActiveAnnotationCommentId(null);
    setDisplayShapes(null);
    setSelectedCommentId(null);
    await fetchComments(asset.id);
  };

  // Annotation handlers
  const handleRequestAnnotation = useCallback(() => {
    if (selectedAsset?.type === 'video') videoRef.current?.pause();
    setActiveAnnotationCommentId(null);
    setDisplayShapes(null);
    setPendingAnnotation(null);
    setIsAnnotationMode(true);
  }, [selectedAsset?.type]);

  const handleAnnotationCapture = useCallback((shapes: string) => {
    setPendingAnnotation(shapes);
    setIsAnnotationMode(false);
  }, []);

  const handleAnnotationCancel = useCallback(() => { setIsAnnotationMode(false); }, []);
  const handleClearAnnotation = useCallback(() => { setPendingAnnotation(null); }, []);

  const handleCaptureFromSidebar = useCallback((): string | null => {
    let shapes: string | null = null;
    if (selectedAsset?.type === 'video') shapes = videoRef.current?.captureAnnotation() ?? null;
    else shapes = imageRef.current?.captureAnnotation() ?? null;
    setIsAnnotationMode(false);
    return shapes;
  }, [selectedAsset?.type]);

  const handleShowAnnotation = useCallback((commentId: string, shapes: string, timestamp?: number) => {
    setActiveAnnotationCommentId(commentId);
    setDisplayShapes(shapes);
    setIsAnnotationMode(false);
    setPendingAnnotation(null);
    if (timestamp !== undefined && selectedAsset?.type === 'video') {
      videoRef.current?.seekTo(timestamp);
      videoRef.current?.pause();
    }
  }, [selectedAsset?.type]);

  const handleHideAnnotation = useCallback(() => {
    setActiveAnnotationCommentId(null);
    setDisplayShapes(null);
  }, []);

  const handleSeek = useCallback((time: number) => {
    videoRef.current?.seekTo(time);
    videoRef.current?.pause();
  }, []);

  const handleUserInteraction = useCallback(() => {
    if (activeAnnotationCommentId) {
      setActiveAnnotationCommentId(null);
      setDisplayShapes(null);
    }
  }, [activeAnnotationCommentId]);

  const handleCommentClickFromTimeline = useCallback((comment: Comment) => {
    if (comment.timestamp !== undefined) {
      videoRef.current?.seekTo(comment.timestamp);
      videoRef.current?.pause();
    }
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

  const handleAddComment = async (
    commentData: {
      text: string;
      timestamp?: number;
      annotation?: { shapes: string; frameTime?: number };
      parentId?: string | null;
      authorName?: string;
      authorEmail?: string;
      reviewLinkId?: string;
    },
    projectId: string
  ) => {
    if (!selectedAsset || !data) return false;
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...commentData,
        assetId: selectedAsset.id,
        projectId,
        authorName: guestInfo?.name,
        authorEmail: guestInfo?.email,
        reviewLinkId: data.reviewLink.id,
      }),
    });
    if (res.ok) { await fetchComments(selectedAsset.id); return true; }
    return false;
  };

  const handleGuestSubmit = (info: { name: string; email: string }) => {
    localStorage.setItem('frame_guest_name', info.name);
    setGuestInfo(info);
  };

  // ── Loading / error / password / guest screens ──────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-frame-bg flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-frame-bg flex items-center justify-center">
        <div className="text-center p-8">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Link not available</h1>
          <p className="text-frame-textSecondary">{error}</p>
        </div>
      </div>
    );
  }

  if (passwordError || (!data && !loading)) {
    return (
      <div className="min-h-screen bg-frame-bg flex items-center justify-center p-4">
        <div className="bg-frame-card border border-frame-border rounded-2xl p-8 w-full max-w-sm shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-rs-gradient" />
          <div className="w-12 h-12 bg-frame-accent/10 border border-frame-accent/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Lock className="w-6 h-6 text-frame-accent" />
          </div>
          <h2 className="text-lg font-semibold text-white text-center mb-1">Password protected</h2>
          <p className="text-frame-textMuted text-sm text-center mb-5">Enter the password to access this review.</p>
          {passwordError && <p className="text-red-400 text-xs text-center mb-3 bg-red-500/10 py-2 rounded-lg">Incorrect password, please try again</p>}
          <input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchReview(password)}
            className="w-full bg-frame-bg border border-frame-border rounded-xl px-4 py-2.5 text-white placeholder-frame-textMuted text-sm focus:outline-none focus:border-frame-accent focus:ring-1 focus:ring-frame-accent/30 mb-3 transition-all"
          />
          <button
            onClick={() => fetchReview(password)}
            className="w-full bg-frame-accent hover:bg-frame-accentHover text-white font-semibold py-2.5 rounded-xl text-sm transition-colors shadow-lg shadow-frame-accent/20"
          >
            Unlock
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  if (!guestInfo && data.reviewLink.allowComments && !authLoading) {
    return (
      <div className="min-h-screen bg-frame-bg flex items-center justify-center">
        <ReviewGuestForm projectName={data.projectName} onSubmit={handleGuestSubmit} />
      </div>
    );
  }

  // ── Main UI ──────────────────────────────────────────────────────────────

  return (
    <div className="h-screen bg-frame-bg flex flex-col overflow-hidden">
      <ReviewHeader reviewLink={data.reviewLink} projectName={data.projectName} />

      <div className="flex flex-1 overflow-hidden">
        {selectedAsset ? (
          <>
            {/* Back button + viewer */}
            <div className="flex-1 flex flex-col bg-black overflow-hidden">
              {/* Back to asset list */}
              <div className="flex-shrink-0 px-3 py-2 bg-black/40 border-b border-white/5">
                <button
                  onClick={() => setSelectedAsset(null)}
                  className="flex items-center gap-1 text-xs text-white/50 hover:text-white transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  All assets
                </button>
              </div>

              <div className="flex-1 overflow-hidden">
                {selectedAsset.type === 'video' ? (
                  <VideoPlayer
                    ref={videoRef}
                    asset={selectedAsset}
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
                  />
                ) : (
                  <ImageViewer
                    ref={imageRef}
                    asset={selectedAsset}
                    comments={comments}
                    isAnnotationMode={isAnnotationMode}
                    onAnnotationCapture={handleAnnotationCapture}
                    onAnnotationCancel={handleAnnotationCancel}
                    displayShapes={displayShapes}
                  />
                )}
              </div>
            </div>

            {/* Sidebar — always shown, readOnly if comments disabled */}
            <CommentSidebar
              asset={selectedAsset}
              comments={comments}
              currentTime={currentTime}
              projectId={data.reviewLink.projectId}
              isAnnotationMode={isAnnotationMode}
              pendingAnnotation={pendingAnnotation}
              onRequestAnnotation={handleRequestAnnotation}
              onCaptureAnnotation={handleCaptureFromSidebar}
              onClearAnnotation={handleClearAnnotation}
              activeAnnotationCommentId={activeAnnotationCommentId}
              selectedCommentId={selectedCommentId}
              onShowAnnotation={handleShowAnnotation}
              onHideAnnotation={handleHideAnnotation}
              onAddComment={handleAddComment}
              onResolveComment={async () => false}
              onDeleteComment={async () => false}
              onSeek={handleSeek}
              onSelectComment={setSelectedCommentId}
              readOnly={!data.reviewLink.allowComments}
              guestName={guestInfo?.name}
            />
          </>
        ) : (
          /* Asset grid */
          <div className="flex-1 overflow-y-auto p-8">
            <h2 className="text-lg font-semibold text-white mb-1">{data.reviewLink.name}</h2>
            <p className="text-sm text-frame-textSecondary mb-6">{data.projectName}</p>

            {data.assets.length === 0 ? (
              <div className="text-center py-16">
                <Film className="w-12 h-12 text-frame-textMuted mx-auto mb-3" />
                <p className="text-frame-textSecondary">No assets in this review link</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {data.assets.map((asset: any) =>
                  asset._deleted ? (
                    <div
                      key={asset.id}
                      className="aspect-video bg-frame-card border border-dashed border-frame-border/50 rounded-xl flex flex-col items-center justify-center gap-2 opacity-40"
                    >
                      <Film className="w-8 h-8 text-frame-textMuted" />
                      <p className="text-xs text-frame-textMuted">Asset removed</p>
                    </div>
                  ) : (
                    <div key={asset.id} className="relative group">
                      <AssetCard asset={asset} onClick={() => handleSelectAsset(asset)} hideActions />
                      {data.reviewLink.allowDownloads && ((asset as any).downloadUrl ?? (asset as any).signedUrl) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const url = ((asset as any).downloadUrl ?? (asset as any).signedUrl) as string;
                            forceDownload(url, asset.name);
                          }}
                          className="absolute bottom-14 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-frame-card/90 backdrop-blur-sm border border-frame-border rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 text-xs text-white hover:bg-frame-cardHover"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download
                        </button>
                      )}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
