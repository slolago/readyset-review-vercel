'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Film, Lock, AlertCircle, ChevronLeft, Download, Folder as FolderIcon, Home, ChevronRight, Clock } from 'lucide-react';
import type { ReviewLink, Asset, Folder, Comment } from '@/types';
import { forceDownload } from '@/lib/utils';
import { AssetCard } from '@/components/files/AssetCard';
import { ReviewHeader } from '@/components/review/ReviewHeader';
import { ReviewGuestForm } from '@/components/review/ReviewGuestForm';
import { CommentSidebar } from '@/components/viewer/CommentSidebar';
import { VideoPlayer, VideoPlayerHandle } from '@/components/viewer/VideoPlayer';
import { ImageViewer, ImageViewerHandle } from '@/components/viewer/ImageViewer';
import { DocumentViewer } from '@/components/viewer/DocumentViewer';
import { HtmlViewer } from '@/components/viewer/HtmlViewer';
import { FileTypeCard } from '@/components/viewer/FileTypeCard';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/hooks/useAuth';

interface ReviewData {
  reviewLink: ReviewLink;
  assets: Asset[];
  folders: Folder[];
  projectName: string;
  currentFolderId?: string | null;
}

export default function ReviewPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [passwordRequired, setPasswordRequired] = useState(false);
  // Only true after the user has actually SUBMITTED a wrong password —
  // distinct from "password required, none attempted yet" so the initial
  // visit doesn't render the "Incorrect password" red banner before the
  // user has typed anything.
  const [passwordError, setPasswordError] = useState(false);
  const [guestInfo, setGuestInfo] = useState<{ name: string; email: string } | null>(() => {
    if (typeof window === 'undefined') return null;
    // New key: single JSON with name + email
    const raw = localStorage.getItem('frame_guest_info');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.name === 'string') {
          return {
            name: parsed.name,
            email: typeof parsed.email === 'string' ? parsed.email : '',
          };
        }
      } catch { /* fall through to legacy */ }
    }
    // Legacy key migration — frame_guest_name stored only the name string.
    // Left in place for back-compat from stale tabs; purge in a follow-up.
    const legacy = localStorage.getItem('frame_guest_name');
    if (legacy) {
      const migrated = { name: legacy, email: '' };
      try { localStorage.setItem('frame_guest_info', JSON.stringify(migrated)); } catch {}
      return migrated;
    }
    return null;
  });
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderCrumbs, setFolderCrumbs] = useState<Array<{ id: string | null; name: string }>>([{ id: null, name: 'All' }]);
  const [passwordValue, setPasswordValue] = useState<string | null>(null); // remembered after unlock

  // Annotation state — same pattern as the internal asset viewer
  const videoRef = useRef<VideoPlayerHandle>(null);
  const imageRef = useRef<ImageViewerHandle>(null);
  const [isAnnotationMode, setIsAnnotationMode] = useState(false);
  const [pendingAnnotation, setPendingAnnotation] = useState<string | null>(null);
  const [activeAnnotationCommentId, setActiveAnnotationCommentId] = useState<string | null>(null);
  const [displayShapes, setDisplayShapes] = useState<string | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  // In/out range — lifted from CommentSidebar so VideoPlayer can loop on the same values.
  const [rangeIn, setRangeIn] = useState<number | undefined>(undefined);
  const [rangeOut, setRangeOut] = useState<number | undefined>(undefined);

  const { user, loading: authLoading } = useAuth();

  const fetchReview = async (pwd?: string, folderId?: string | null) => {
    try {
      const qs = new URLSearchParams();
      const effectivePwd = pwd ?? passwordValue ?? undefined;
      if (folderId) qs.set('folder', folderId);
      // SEC-21: send password via header, not query string, so CDN/Vercel
      // access logs don't capture it.
      const headers: Record<string, string> = {};
      if (effectivePwd) headers['x-review-password'] = effectivePwd;
      const res = await fetch(`/api/review-links/${token}?${qs}`, { headers });
      if (res.status === 401) {
        setPasswordRequired(true);
        // Only flag as error if the user actually submitted a password
        // (first visit on a password-locked link shouldn't show
        // "Incorrect password" before they've typed anything).
        setPasswordError(effectivePwd !== undefined && effectivePwd !== '');
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Review link not found or expired');
      }
      const json = await res.json();
      setData(json);
      setPasswordRequired(false);
      setPasswordError(false);
      if (pwd !== undefined) setPasswordValue(pwd);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load review');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchReview(); }, [token]);

  const handleEnterFolder = async (folder: Folder) => {
    setLoading(true);
    setSelectedAsset(null);
    setCurrentFolderId(folder.id);
    setFolderCrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
    await fetchReview(undefined, folder.id);
  };

  const handleJumpToCrumb = async (index: number) => {
    const crumb = folderCrumbs[index];
    setLoading(true);
    setSelectedAsset(null);
    setCurrentFolderId(crumb.id);
    setFolderCrumbs(folderCrumbs.slice(0, index + 1));
    await fetchReview(undefined, crumb.id);
  };

  useEffect(() => {
    if (!authLoading && user) {
      setGuestInfo({ name: user.name, email: user.email });
    }
  }, [authLoading, user]);

  // Clear composer/annotation state whenever the displayed asset changes so a
  // drawing captured for Asset A cannot leak into Asset B.
  useEffect(() => {
    setIsAnnotationMode(false);
    setPendingAnnotation(null);
    setActiveAnnotationCommentId(null);
    setDisplayShapes(null);
    setSelectedCommentId(null);
    setRangeIn(undefined);
    setRangeOut(undefined);
  }, [selectedAsset?.id]);

  const fetchComments = useCallback(async (assetId: string) => {
    // SEC-21: password in header, not query string
    const headers: Record<string, string> = {};
    if (passwordValue) headers['x-review-password'] = passwordValue;
    const res = await fetch(
      `/api/comments?assetId=${assetId}&reviewToken=${token}`,
      { headers }
    );
    if (res.ok) {
      const json = await res.json();
      setComments(json.comments);
    }
  }, [token, passwordValue]);

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

    // VWR-04: range-comment clicks hydrate the shared loop range so loop,
    // Export trim, and composer range all reflect the clicked range.
    if (typeof comment.inPoint === 'number' && typeof comment.outPoint === 'number') {
      setRangeIn(comment.inPoint);
      setRangeOut(comment.outPoint);
    }
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
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (passwordValue) headers['x-review-password'] = passwordValue;
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers,
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
    try { localStorage.setItem('frame_guest_info', JSON.stringify(info)); } catch {}
    setGuestInfo(info);
  };

  const handleResolveComment = async (id: string, resolved: boolean) => {
    if (!selectedAsset) return false;
    const res = await fetch(`/api/comments/${id}?reviewToken=${token}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved }),
    });
    if (res.ok) { await fetchComments(selectedAsset.id); return true; }
    return false;
  };

  const handleDeleteComment = async (id: string) => {
    if (!selectedAsset) return false;
    const res = await fetch(`/api/comments/${id}?reviewToken=${token}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-Guest-Name': guestInfo?.name ?? '',
      },
    });
    if (res.ok) { await fetchComments(selectedAsset.id); return true; }
    return false;
  };

  // ── Loading / error / password / guest screens ──────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-frame-bg flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error && /expired/i.test(error)) {
    return (
      <div className="min-h-screen bg-frame-bg flex items-center justify-center">
        <div className="text-center p-8">
          <Clock className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">This link has expired</h1>
          <p className="text-frame-textSecondary">Contact whoever shared it with you for a fresh link.</p>
        </div>
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

  // Client-side guard: if the link's expiresAt resolved to the past mid-session,
  // force-render the expired screen (race after load).
  if (data?.reviewLink.expiresAt) {
    const exp = (data.reviewLink.expiresAt as any);
    const d = typeof exp?.toDate === 'function' ? exp.toDate() as Date : null;
    if (d && d.getTime() <= Date.now()) {
      return (
        <div className="min-h-screen bg-frame-bg flex items-center justify-center">
          <div className="text-center p-8">
            <Clock className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-white mb-2">This link has expired</h1>
            <p className="text-frame-textSecondary">Contact whoever shared it with you for a fresh link.</p>
          </div>
        </div>
      );
    }
  }

  if (passwordRequired || (!data && !loading)) {
    return (
      <div className="min-h-screen bg-frame-bg flex items-center justify-center p-4">
        <div className="bg-frame-card border border-frame-border rounded-2xl p-8 w-full max-w-sm shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-rs-gradient" />
          <div className="w-12 h-12 bg-frame-accent/10 border border-frame-accent/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Lock className="w-6 h-6 text-frame-accent" />
          </div>
          <h2 className="text-lg font-semibold text-white text-center mb-1">Password protected</h2>
          <p className="text-frame-textMuted text-sm text-center mb-5">
            Enter the password shared with you by the project owner.
          </p>
          {passwordError && (
            <div className="mb-3 bg-red-500/10 rounded-lg py-2 px-3">
              <p className="text-red-400 text-xs text-center">Incorrect password</p>
              <p className="text-frame-textMuted text-[11px] text-center mt-1">
                If you believe this is incorrect, contact whoever sent you the link.
              </p>
            </div>
          )}
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
                    downloadUrl={
                      data.reviewLink.allowDownloads
                        ? ((selectedAsset as any).downloadUrl ?? (selectedAsset as any).signedUrl)
                        : undefined
                    }
                    loopIn={rangeIn}
                    loopOut={rangeOut}
                    onLoopInChange={setRangeIn}
                    onLoopOutChange={setRangeOut}
                  />
                ) : selectedAsset.type === 'image' ? (
                  <ImageViewer
                    ref={imageRef}
                    asset={selectedAsset}
                    comments={comments}
                    isAnnotationMode={isAnnotationMode}
                    onAnnotationCapture={handleAnnotationCapture}
                    onAnnotationCancel={handleAnnotationCancel}
                    displayShapes={displayShapes}
                  />
                ) : selectedAsset.subtype === 'pdf' ? (
                  <DocumentViewer key={selectedAsset.id} asset={selectedAsset} />
                ) : selectedAsset.subtype === 'html' ? (
                  <HtmlViewer key={selectedAsset.id} asset={selectedAsset} />
                ) : (
                  <FileTypeCard key={selectedAsset.id} asset={selectedAsset} />
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
              onResolveComment={handleResolveComment}
              onDeleteComment={handleDeleteComment}
              onSeek={handleSeek}
              onSelectComment={setSelectedCommentId}
              inPoint={rangeIn}
              outPoint={rangeOut}
              onInPointChange={setRangeIn}
              onOutPointChange={setRangeOut}
              readOnly={!data.reviewLink.allowComments}
              guestName={guestInfo?.name}
              isGuest
            />
          </>
        ) : (
          /* Asset grid */
          <div className="flex-1 overflow-y-auto p-8">
            <h2 className="text-lg font-semibold text-white mb-1">{data.reviewLink.name}</h2>
            <p className="text-sm text-frame-textSecondary mb-4">{data.projectName}</p>

            {/* Folder breadcrumbs */}
            {folderCrumbs.length > 1 && (
              <div className="flex items-center gap-1 text-sm mb-6 flex-wrap">
                {folderCrumbs.map((crumb, i) => (
                  <div key={`${crumb.id ?? 'root'}-${i}`} className="flex items-center gap-1">
                    <button
                      onClick={() => i < folderCrumbs.length - 1 && handleJumpToCrumb(i)}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
                        i === folderCrumbs.length - 1
                          ? 'text-white font-medium'
                          : 'text-frame-textSecondary hover:text-white hover:bg-frame-cardHover'
                      }`}
                    >
                      {i === 0 && <Home className="w-3.5 h-3.5" />}
                      {crumb.name}
                    </button>
                    {i < folderCrumbs.length - 1 && <ChevronRight className="w-3 h-3 text-frame-textMuted" />}
                  </div>
                ))}
              </div>
            )}

            {data.assets.length === 0 && (!data.folders || data.folders.length === 0) ? (
              <div className="text-center py-16">
                <Film className="w-12 h-12 text-frame-textMuted mx-auto mb-3" />
                <p className="text-frame-textSecondary">
                  {currentFolderId ? 'This folder is empty' : 'No assets in this review link'}
                </p>
              </div>
            ) : (
              <>
                {/* Folders */}
                {data.folders && data.folders.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-xs font-semibold text-frame-textMuted uppercase tracking-wider mb-3">
                      Folders ({data.folders.length})
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {data.folders.map((folder) => (
                        <button
                          key={folder.id}
                          onClick={() => handleEnterFolder(folder)}
                          className="group bg-frame-card hover:bg-frame-cardHover border border-frame-border hover:border-frame-borderLight rounded-xl p-4 transition-all text-left"
                        >
                          <FolderIcon className="w-8 h-8 text-frame-accent mb-2" />
                          <p className="text-sm font-medium text-white truncate">{folder.name}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Assets */}
                {data.assets.length > 0 && (
                  <>
                    {data.folders && data.folders.length > 0 && (
                      <h3 className="text-xs font-semibold text-frame-textMuted uppercase tracking-wider mb-3">
                        Assets ({data.assets.filter((a: any) => !a._deleted).length})
                      </h3>
                    )}
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
                            <AssetCard
                              asset={asset}
                              onClick={() => handleSelectAsset(asset)}
                              hideActions
                              displayDateOverride={data?.reviewLink?.createdAt}
                              displayDateLabel="Shared"
                            />
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
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
