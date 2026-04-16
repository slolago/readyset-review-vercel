'use client';

import { useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { formatRelativeTime, formatDuration } from '@/lib/utils';
import type { Comment } from '@/types';
import { CheckCircle, CheckCircle2, Trash2, Reply, CornerDownRight, Pencil } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

function renderCommentText(text: string): React.ReactNode {
  const urlRegex = /https?:\/\/[^\s<>"]+/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(
      <a key={match.index} href={match[0]} target="_blank" rel="noopener noreferrer"
         className="text-frame-accent underline hover:text-frame-accentHover break-all"
         onClick={(e) => e.stopPropagation()}>
        {match[0]}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

interface CommentItemProps {
  comment: Comment;
  replies?: Comment[];
  onResolve?: (id: string, resolved: boolean) => void;
  onDelete?: (id: string) => void;
  onEdit?: (id: string, newText: string) => void;
  onSeek?: (time: number) => void;
  onReply?: (parentId: string) => void;
  onAnnotationClick?: (comment: Comment) => void;
  onCommentClick?: (comment: Comment) => void;
  isAnnotationActive?: boolean;
  isSelected?: boolean;
  readOnly?: boolean;
}

export function CommentItem({
  comment,
  replies = [],
  onResolve,
  onDelete,
  onEdit,
  onSeek,
  onReply,
  onAnnotationClick,
  onCommentClick,
  isAnnotationActive = false,
  isSelected = false,
  readOnly = false,
}: CommentItemProps) {
  const { user } = useAuth();
  const [showReplies, setShowReplies] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);

  const handleSaveEdit = () => {
    if (editText.trim() && editText.trim() !== comment.text) {
      onEdit?.(comment.id, editText.trim());
    }
    setIsEditing(false);
  };

  const createdAt = comment.createdAt?.toDate?.() || new Date();
  const canDelete = !readOnly && (user?.id === comment.authorId || user?.role === 'admin' || user?.role === 'manager' || user?.role === 'editor');
  const hasAnnotation = !!(comment.annotation?.shapes && comment.annotation.shapes !== '[]');
  const hasTimestamp = comment.timestamp !== undefined;

  const handleClick = () => {
    // Clicking the comment body seeks to its timestamp
    if (hasTimestamp) {
      onSeek?.(comment.timestamp!);
      onCommentClick?.(comment);
      // Also show annotation if present
      if (hasAnnotation && onAnnotationClick) {
        onAnnotationClick(comment);
      }
    }
  };

  return (
    <div
      className={`group rounded-lg transition-colors px-2 py-2 ${
        comment.resolved ? 'opacity-50' : ''
      } ${hasTimestamp ? 'cursor-pointer hover:bg-white/5' : ''} ${
        isSelected ? 'bg-frame-accent/10 ring-1 ring-frame-accent/40' : ''
      }`}
      onClick={handleClick}
    >
      <div className="flex gap-3">
        {/* Timecode pill on the left for video comments */}
        {hasTimestamp && (
          <div className="flex-shrink-0 pt-0.5">
            <div className="px-1.5 py-0.5 bg-frame-accent/15 border border-frame-accent/30 rounded text-[10px] font-mono text-frame-accent font-medium whitespace-nowrap">
              {formatDuration(comment.timestamp!)}
            </div>
          </div>
        )}

        <div className={`flex-1 min-w-0 ${!hasTimestamp ? '' : ''}`}>
          {/* Author + time */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Avatar name={comment.authorName} size="sm" className="flex-shrink-0" />
            <span className="text-xs font-medium text-white">{comment.authorName}</span>
            {comment.resolved && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
            <span className="text-[10px] text-frame-textMuted ml-auto">{formatRelativeTime(createdAt)}</span>
          </div>

          {/* Text */}
          {isEditing ? (
            <div>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
                  if (e.key === 'Escape') setIsEditing(false);
                }}
                rows={3}
                className="w-full bg-frame-bg border border-frame-border rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-frame-accent"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
              <div className="flex gap-2 mt-1.5">
                <button onClick={(e) => { e.stopPropagation(); handleSaveEdit(); }} className="px-3 py-1 bg-frame-accent text-white text-xs rounded-lg hover:bg-frame-accentHover">Save</button>
                <button onClick={(e) => { e.stopPropagation(); setIsEditing(false); }} className="px-3 py-1 text-frame-textMuted text-xs hover:text-white">Cancel</button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-frame-textSecondary leading-relaxed whitespace-pre-wrap break-words">
              {renderCommentText(comment.text)}
            </p>
          )}

          {/* Annotation button */}
          {hasAnnotation && (
            <button
              onClick={(e) => { e.stopPropagation(); onAnnotationClick?.(comment); }}
              className={`mt-1.5 flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium transition-all ${
                isAnnotationActive
                  ? 'bg-frame-accent text-white'
                  : 'bg-frame-accent/15 text-frame-accent hover:bg-frame-accent/30'
              }`}
            >
              <Pencil className="w-3 h-3" />
              {isAnnotationActive ? 'Hide annotation' : 'Show annotation'}
            </button>
          )}

          {/* Actions (on hover) */}
          {!readOnly && (
            <div
              className="flex items-center gap-2 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              {onResolve && (
                <button
                  onClick={() => onResolve(comment.id, !comment.resolved)}
                  className={`flex items-center gap-1 text-xs transition-colors ${
                    comment.resolved
                      ? 'text-frame-green hover:text-frame-green/70'
                      : 'text-frame-textMuted hover:text-frame-green'
                  }`}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  {comment.resolved ? 'Reopen' : 'Resolve'}
                </button>
              )}
              {onEdit && !comment.resolved && user?.id === comment.authorId && (
                <button
                  onClick={(e) => { e.stopPropagation(); setIsEditing(true); setEditText(comment.text); }}
                  className="flex items-center gap-1 text-xs text-frame-textMuted hover:text-white transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
              )}
              {onReply && !comment.parentId && (
                <button
                  onClick={() => onReply(comment.id)}
                  className="flex items-center gap-1 text-xs text-frame-textMuted hover:text-white transition-colors"
                >
                  <Reply className="w-3.5 h-3.5" />
                  Reply
                </button>
              )}
              {canDelete && onDelete && (
                <button
                  onClick={() => onDelete(comment.id)}
                  className="flex items-center gap-1 text-xs text-frame-textMuted hover:text-red-400 transition-colors ml-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Replies */}
      {replies.length > 0 && (
        <div className="ml-2 mt-2 space-y-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setShowReplies((v) => !v)}
            className="text-xs text-frame-accent hover:text-frame-accentHover transition-colors flex items-center gap-1 ml-1"
          >
            <CornerDownRight className="w-3 h-3" />
            {showReplies ? 'Hide' : 'Show'} {replies.length} {replies.length !== 1 ? 'replies' : 'reply'}
          </button>
          {showReplies &&
            replies.map((reply) => (
              <div key={reply.id} className="pl-3 border-l border-frame-border">
                <CommentItem
                  comment={reply}
                  onResolve={onResolve}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  onSeek={onSeek}
                  readOnly={readOnly}
                />
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
