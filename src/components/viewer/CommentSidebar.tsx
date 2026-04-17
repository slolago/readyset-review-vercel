'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { CommentItem } from './CommentItem';
import type { Asset, Comment } from '@/types';
import { MessageSquare, Send, Clock, Pencil, X, Filter, CheckCircle2, Info } from 'lucide-react';
import { FileInfoPanel } from './FileInfoPanel';
import { formatTimestamp } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';

interface CommentSidebarProps {
  asset: Asset;
  comments: Comment[];
  currentTime: number;
  projectId: string;
  isAnnotationMode: boolean;
  pendingAnnotation: string | null;
  onRequestAnnotation: () => void;
  // Called by sidebar to capture the canvas before submitting
  onCaptureAnnotation: () => string | null;
  onClearAnnotation: () => void;
  activeAnnotationCommentId: string | null;
  selectedCommentId?: string | null;
  onShowAnnotation: (commentId: string, shapes: string, timestamp?: number) => void;
  onHideAnnotation: () => void;
  onSelectComment?: (id: string) => void;
  onAddComment: (
    data: {
      text: string;
      timestamp?: number;
      inPoint?: number;
      outPoint?: number;
      annotation?: { shapes: string; frameTime?: number };
      parentId?: string | null;
      authorName?: string;
      authorEmail?: string;
      reviewLinkId?: string;
    },
    projectId: string
  ) => Promise<boolean>;
  onResolveComment: (id: string, resolved: boolean) => Promise<boolean>;
  onDeleteComment: (id: string) => Promise<boolean>;
  onEditComment?: (id: string, newText: string) => Promise<boolean>;
  onSeek?: (time: number) => void;
  readOnly?: boolean;
  guestName?: string;
}

export function CommentSidebar({
  asset, comments, currentTime, projectId,
  isAnnotationMode, pendingAnnotation,
  onRequestAnnotation, onCaptureAnnotation, onClearAnnotation,
  activeAnnotationCommentId, selectedCommentId, onShowAnnotation, onHideAnnotation,
  onAddComment, onResolveComment, onDeleteComment, onEditComment, onSeek,
  onSelectComment,
  readOnly = false, guestName,
}: CommentSidebarProps) {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [includeTimestamp, setIncludeTimestamp] = useState(asset.type === 'video');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [activeTab, setActiveTab] = useState<'comments' | 'info'>('comments');
  const [submitting, setSubmitting] = useState(false);
  const [inPoint, setInPoint] = useState<number | undefined>(undefined);
  const [outPoint, setOutPoint] = useState<number | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Shortcut C → focus textarea
  useEffect(() => {
    const handler = () => textareaRef.current?.focus();
    window.addEventListener('focus-comment-input', handler);
    return () => window.removeEventListener('focus-comment-input', handler);
  }, []);

  // Scroll to + highlight comment when selected via timeline marker
  useEffect(() => {
    if (!selectedCommentId || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-comment-id="${selectedCommentId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedCommentId]);

  // Sort top-level: timed ascending, untimed after — memoized so it only
  // recalculates when comments array or showResolved changes, not on every currentTime tick.
  const topLevel = useMemo(
    () =>
      comments
        .filter((c) => !c.parentId && (showResolved || !c.resolved))
        .sort((a, b) => {
          const aT = a.timestamp !== undefined, bT = b.timestamp !== undefined;
          if (aT && bT) return (a.timestamp ?? 0) - (b.timestamp ?? 0);
          if (aT) return -1; if (bT) return 1; return 0;
        }),
    [comments, showResolved]
  );

  const getReplies = (id: string) => comments.filter((c) => c.parentId === id);

  const handleSubmit = async () => {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      const commentData: Parameters<typeof onAddComment>[0] = {
        text: text.trim(),
        parentId: replyTo || null,
      };

      if (inPoint !== undefined && outPoint !== undefined) {
        commentData.inPoint = inPoint;
        commentData.outPoint = outPoint;
        commentData.timestamp = inPoint;
      } else if (includeTimestamp && asset.type === 'video') {
        commentData.timestamp = currentTime;
      }

      // If still in annotation mode, auto-capture the canvas now
      let shapes = pendingAnnotation;
      if (isAnnotationMode) {
        shapes = onCaptureAnnotation();
      }

      if (shapes && shapes !== '[]') {
        commentData.annotation = { shapes, frameTime: currentTime };
      }

      if (guestName) commentData.authorName = guestName;

      const success = await onAddComment(commentData, projectId);
      if (success) {
        setText('');
        onClearAnnotation();
        setReplyTo(null);
        setInPoint(undefined);
        setOutPoint(undefined);
        // Re-focus so user can type another comment immediately
        textareaRef.current?.focus();
      } else {
        toast.error('Failed to post comment');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAnnotationClick = (comment: Comment) => {
    if (!comment.annotation?.shapes || comment.annotation.shapes === '[]') return;
    if (activeAnnotationCommentId === comment.id) {
      onHideAnnotation();
    } else {
      onShowAnnotation(comment.id, comment.annotation.shapes, comment.timestamp);
    }
  };

  const hasAnnotation = !!pendingAnnotation && pendingAnnotation !== '[]';

  return (
    <div className="w-80 flex-shrink-0 bg-frame-sidebar border-l border-frame-border flex flex-col">
      {/* Tab bar */}
      <div className="flex border-b border-frame-border flex-shrink-0">
        <button
          onClick={() => setActiveTab('comments')}
          className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors flex-1 justify-center border-b-2 ${
            activeTab === 'comments'
              ? 'border-frame-accent text-white'
              : 'border-transparent text-frame-textMuted hover:text-white'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Comments
          {comments.length > 0 && activeTab === 'comments' && (
            <span className="ml-0.5 text-xs bg-frame-accent/20 text-frame-accent px-1.5 py-0.5 rounded-full">
              {comments.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('info')}
          className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors flex-1 justify-center border-b-2 ${
            activeTab === 'info'
              ? 'border-frame-accent text-white'
              : 'border-transparent text-frame-textMuted hover:text-white'
          }`}
        >
          <Info className="w-3.5 h-3.5" />
          Info
        </button>
        {activeTab === 'comments' && (
          <button
            onClick={() => setShowResolved((v) => !v)}
            className={`p-3 transition-colors ${showResolved ? 'text-frame-accent' : 'text-frame-textMuted hover:text-white'}`}
            title="Toggle resolved"
          >
            <Filter className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Info tab panel */}
      {activeTab === 'info' && <FileInfoPanel asset={asset} />}

      {/* Comments list */}
      {activeTab === 'comments' && <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-1">
        {topLevel.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="w-8 h-8 text-frame-textMuted mx-auto mb-2" />
            <p className="text-frame-textMuted text-sm">No comments yet</p>
            {!readOnly && <p className="text-frame-textMuted text-xs mt-1">Be the first to comment</p>}
          </div>
        ) : (
          topLevel.map((comment) => (
            <div key={comment.id} data-comment-id={comment.id}>
              <CommentItem
                comment={comment}
                replies={getReplies(comment.id)}
                onResolve={readOnly ? undefined : onResolveComment}
                onDelete={readOnly ? undefined : onDeleteComment}
                onEdit={readOnly ? undefined : onEditComment}
                onSeek={(t) => onSeek?.(t)}
                onReply={readOnly ? undefined : (id) => setReplyTo(id)}
                onAnnotationClick={handleAnnotationClick}
                onCommentClick={(c) => {
                  if (c.timestamp !== undefined) onSeek?.(c.timestamp);
                  const hasAnnotation = !!(c.annotation?.shapes && c.annotation.shapes !== '[]');
                  if (!hasAnnotation) onHideAnnotation();
                  onSelectComment?.(c.id);
                }}
                isAnnotationActive={activeAnnotationCommentId === comment.id}
                isSelected={selectedCommentId === comment.id}
                readOnly={readOnly}
              />
            </div>
          ))
        )}
      </div>}

      {/* Input */}
      {activeTab === 'comments' && !readOnly && (
        <div className="border-t border-frame-border p-4 space-y-2">
          {replyTo && (
            <div className="flex items-center justify-between px-2 py-1.5 bg-frame-accent/10 rounded-lg">
              <span className="text-xs text-frame-accent">Replying to comment</span>
              <button onClick={() => setReplyTo(null)} className="text-frame-textMuted hover:text-white"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {isAnnotationMode && (
            <div className="px-2 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <span className="text-xs text-yellow-400 flex items-center gap-1.5">
                <Pencil className="w-3 h-3" />
                Drawing on {asset.type} — press Enter to attach & post
              </span>
            </div>
          )}

          {hasAnnotation && !isAnnotationMode && (
            <div className="flex items-center justify-between px-2 py-1.5 bg-frame-accent/10 rounded-lg">
              <span className="text-xs text-frame-accent flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3" />
                Annotation attached
                {includeTimestamp && asset.type === 'video' && (
                  <span className="text-frame-textMuted">@ {formatTimestamp(currentTime)}</span>
                )}
              </span>
              <button onClick={onClearAnnotation} className="text-frame-textMuted hover:text-white"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={isAnnotationMode ? 'Add a comment (Enter to post with drawing)...' : 'Add a comment... (Enter to post, Shift+Enter for new line)'}
            rows={3}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            className="w-full bg-frame-bg border border-frame-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-frame-textMuted resize-none focus:outline-none focus:border-frame-accent transition-colors"
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {asset.type === 'video' && (
                <button
                  type="button"
                  onClick={() => setIncludeTimestamp((v) => !v)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${includeTimestamp ? 'bg-frame-accent/15 text-frame-accent' : 'text-frame-textMuted hover:text-white'}`}
                >
                  <Clock className="w-3 h-3" />
                  {includeTimestamp ? formatTimestamp(currentTime) : 'No time'}
                </button>
              )}
              {asset.type === 'video' && (
                <>
                  <button
                    type="button"
                    onClick={() => setInPoint(currentTime)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${
                      inPoint !== undefined ? 'bg-frame-accent/15 text-frame-accent' : 'text-frame-textMuted hover:text-white'
                    }`}
                    title="Set in-point"
                  >
                    <span className="font-mono text-[10px]">IN</span>
                    {inPoint !== undefined && <span className="font-mono text-[10px]">{formatTimestamp(inPoint)}</span>}
                  </button>
                  {inPoint !== undefined && (
                    <button
                      type="button"
                      onClick={() => setOutPoint(currentTime)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${
                        outPoint !== undefined ? 'bg-frame-accent/15 text-frame-accent' : 'text-frame-textMuted hover:text-white'
                      }`}
                      title="Set out-point"
                    >
                      <span className="font-mono text-[10px]">OUT</span>
                      {outPoint !== undefined && <span className="font-mono text-[10px]">{formatTimestamp(outPoint)}</span>}
                    </button>
                  )}
                  {(inPoint !== undefined || outPoint !== undefined) && (
                    <button
                      type="button"
                      onClick={() => { setInPoint(undefined); setOutPoint(undefined); }}
                      className="text-frame-textMuted hover:text-red-400 text-xs px-1"
                      title="Clear range"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={onRequestAnnotation}
                disabled={isAnnotationMode}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${isAnnotationMode || hasAnnotation ? 'bg-frame-accent/15 text-frame-accent' : 'text-frame-textMuted hover:text-white'}`}
              >
                <Pencil className="w-3 h-3" />
                Draw
              </button>
            </div>
            <button
              onClick={handleSubmit}
              disabled={!text.trim() || submitting}
              className="w-8 h-8 flex items-center justify-center bg-frame-accent hover:bg-frame-accentHover disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
