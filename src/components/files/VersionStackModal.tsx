'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GripVertical, Unlink, Trash2, X } from 'lucide-react';
import type { Asset } from '@/types';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';

export interface VersionStackModalProps {
  asset: Asset;
  onClose: () => void;
  onDeleted?: () => void;
  getIdToken: () => Promise<string | null>;
}

interface DragState {
  /** Source index at drag start. */
  fromIdx: number;
  /**
   * Target gap in the pre-drag array: 0..versions.length. Gap `i` means
   * "insert before the item currently at index `i`"; gap `versions.length`
   * means "insert at the end". Computed from pointer Y vs. row midpoints.
   */
  gap: number;
  /** PointerId captured by the grip handle, used to filter stray move events. */
  pointerId: number;
}

export function VersionStackModal({ asset, onClose, onDeleted, getIdToken }: VersionStackModalProps) {
  const [versions, setVersions] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [reordering, setReordering] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  // Tracks whether the user reordered during this modal session. Re-used as
  // the signal to trigger parent refresh on close — without it the caller's
  // asset list keeps showing the pre-reorder V# mapping.
  const reorderedRef = useRef(false);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const confirm = useConfirm();

  const handleClose = () => {
    if (reorderedRef.current) onDeleted?.();
    onClose();
  };

  const fetchVersions = useCallback(async () => {
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
  }, [asset.id, getIdToken]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const formatDate = (createdAt: Asset['createdAt']) => {
    const date =
      typeof createdAt?.toDate === 'function'
        ? createdAt.toDate()
        : new Date((createdAt as any)?._seconds * 1000 || Date.now());
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const handleDelete = async (version: Asset) => {
    const ok = await confirm({
      title: `Delete version V${version.version} of "${version.name}"?`,
      message: 'This cannot be undone.',
      destructive: true,
    });
    if (!ok) return;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/assets/${version.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success(`Deleted V${version.version}`);
        const remaining = versions.filter((v) => v.id !== version.id);
        setVersions(remaining);
        if (remaining.length === 0 || version.id === asset.id) {
          onDeleted?.();
          onClose();
        }
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ? `Delete failed: ${data.error}` : 'Delete failed');
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ assetId: version.id }),
      });
      if (res.ok) {
        toast.success(`V${version.version} unstacked`);
        const remaining = versions.filter((v) => v.id !== version.id);
        setVersions(remaining); // optimistic UI feedback
        // Always refetch — after a root-detach the server re-roots remaining
        // members onto a new versionGroupId, so local cache is stale.
        if (version.id === asset.id || remaining.length <= 1) {
          onDeleted?.();
          onClose();
        } else {
          onDeleted?.();
          await fetchVersions();
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
    if (fromIdx === toIdx || reordering) return;
    if (toIdx < 0 || toIdx >= versions.length) return;

    const reordered = [...versions];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setVersions(reordered); // optimistic
    setReordering(true);

    try {
      const token = await getIdToken();
      const res = await fetch('/api/assets/reorder-versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderedIds: reordered.map((v) => v.id) }),
      });
      if (res.ok) {
        reorderedRef.current = true;
      } else {
        toast.error('Reorder failed');
      }
      // Always re-sync from server — optimistic state may diverge if server
      // rejected partial input or applied a re-root.
      await fetchVersions();
    } catch {
      toast.error('Reorder failed');
      await fetchVersions();
    } finally {
      setReordering(false);
    }
  };

  // ── Pointer-based drag ───────────────────────────────────────────────────
  //
  // HTML5 drag-and-drop is unreliable in scrollable modal containers (events
  // swallowed by the scroll parent, ghost image fails silently across
  // browsers). Pointer events work the same way regardless of container —
  // we capture the pointer on pointerdown so every subsequent move/up fires
  // on the originating handle, even if the cursor exits the modal.
  //
  // `gap` = target insertion point in the pre-drag array. 0 means "before
  // row 0"; versions.length means "after the last row". Splice translates
  // gap → insertIdx by accounting for the removal shifting later items.

  const isSelfGap = (fromIdx: number, gap: number) =>
    gap === fromIdx || gap === fromIdx + 1;

  const computeGapFromY = (y: number): number => {
    // Walk rows top→bottom; the first row whose midpoint is below the
    // pointer defines the gap. If the pointer is past every midpoint we
    // land at gap = versions.length (end of list).
    for (let i = 0; i < rowRefs.current.length; i++) {
      const el = rowRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (y < mid) return i;
    }
    return rowRefs.current.length;
  };

  const handleGripPointerDown = (idx: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (versions.length <= 1 || reordering) return;
    // preventDefault stops the browser from selecting text / scrolling the
    // list on touch; focus on the button still happens normally.
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Some environments throw if capture fails; fall back to global
      // listeners below so the drag still works.
    }
    setDragState({ fromIdx: idx, gap: idx, pointerId: e.pointerId });
  };

  const handleGripPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    const gap = computeGapFromY(e.clientY);
    if (gap !== dragState.gap) {
      setDragState({ ...dragState, gap });
    }
  };

  const handleGripPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Release can throw if the capture was already lost; safe to ignore.
    }
    const { fromIdx, gap } = dragState;
    setDragState(null);
    if (!isSelfGap(fromIdx, gap)) {
      // Translate gap → splice target. Removing fromIdx shifts later items
      // up by one, so for gap > fromIdx we subtract 1.
      const insertAt = fromIdx < gap ? gap - 1 : gap;
      void handleReorder(fromIdx, insertAt);
    }
  };

  const handleGripPointerCancel = () => {
    // Fires if the OS cancels the pointer (e.g. touch canceled by a gesture).
    setDragState(null);
  };

  // Escape anywhere cancels an in-flight drag (doesn't close the modal,
  // since the drag state is higher priority).
  useEffect(() => {
    if (!dragState) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setDragState(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [dragState]);

  // Keyboard-only reorder on the grip handle. Focus the grip + arrow keys
  // to nudge; Home/End jump to the edges.
  const handleGripKeyDown = (idx: number) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (reordering || versions.length <= 1) return;
    switch (e.key) {
      case 'ArrowUp':
        if (idx > 0) {
          e.preventDefault();
          void handleReorder(idx, idx - 1);
        }
        break;
      case 'ArrowDown':
        if (idx < versions.length - 1) {
          e.preventDefault();
          void handleReorder(idx, idx + 1);
        }
        break;
      case 'Home':
        if (idx > 0) {
          e.preventDefault();
          void handleReorder(idx, 0);
        }
        break;
      case 'End':
        if (idx < versions.length - 1) {
          e.preventDefault();
          void handleReorder(idx, versions.length - 1);
        }
        break;
    }
  };

  const showGapLine = (gapIdx: number) =>
    dragState !== null &&
    dragState.gap === gapIdx &&
    !isSelfGap(dragState.fromIdx, gapIdx);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="bg-frame-card border border-frame-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-frame-border">
          <h3 className="text-sm font-semibold text-white">Version stack</h3>
          <button onClick={handleClose} className="text-frame-textMuted hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-80 overflow-y-auto py-2 select-none">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-frame-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : versions.length === 0 ? (
            <p className="text-center text-sm text-frame-textMuted py-8">No versions found.</p>
          ) : (
            <>
              {versions.map((version, idx) => {
                const canReorder = versions.length > 1;
                const isDragSource = dragState?.fromIdx === idx;
                return (
                  <React.Fragment key={version.id}>
                    <InsertionLine visible={showGapLine(idx)} />
                    <div
                      ref={(el) => {
                        rowRefs.current[idx] = el;
                      }}
                      className={[
                        'flex items-center gap-3 px-5 py-3 transition-colors',
                        isDragSource ? 'opacity-40' : 'hover:bg-frame-border/30',
                      ].join(' ')}
                    >
                      {canReorder && (
                        <button
                          type="button"
                          onPointerDown={handleGripPointerDown(idx)}
                          onPointerMove={handleGripPointerMove}
                          onPointerUp={handleGripPointerUp}
                          onPointerCancel={handleGripPointerCancel}
                          onKeyDown={handleGripKeyDown(idx)}
                          disabled={reordering}
                          aria-label={`Reorder V${idx + 1} — drag or use arrow keys`}
                          title="Drag to reorder, or focus and use ↑ ↓ / Home / End"
                          className={[
                            'flex-shrink-0 p-1 -m-1 rounded text-frame-textMuted hover:text-white transition-colors',
                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-frame-accent',
                            'disabled:opacity-30 disabled:cursor-not-allowed',
                            dragState ? 'cursor-grabbing' : 'cursor-grab',
                            // touch-action:none prevents the browser from
                            // stealing vertical drags as page scroll on
                            // touch devices — essential for a working
                            // mobile reorder.
                            'touch-none',
                          ].join(' ')}
                        >
                          <GripVertical className="w-4 h-4" />
                        </button>
                      )}
                      <span
                        className={`flex-shrink-0 text-xs px-2 py-0.5 rounded font-mono ${
                          version.id === asset.id
                            ? 'bg-frame-accent text-white'
                            : 'bg-frame-accent/20 text-frame-accent'
                        }`}
                      >
                        V{idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-white truncate">{version.name}</p>
                          {version.id === asset.id && (
                            <span className="flex-shrink-0 text-[10px] uppercase tracking-wide text-frame-accent font-semibold">
                              Current
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-frame-textMuted">
                          {formatDate(version.createdAt)} &middot; {version.uploadedBy}
                        </p>
                      </div>
                      {versions.length > 1 && (
                        <>
                          <button
                            onClick={() => handleUnstack(version)}
                            disabled={!!dragState || reordering}
                            className="flex-shrink-0 text-frame-textMuted hover:text-white transition-colors disabled:opacity-40"
                            title={`Unstack V${idx + 1} — leaves comments and review links intact`}
                          >
                            <Unlink className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(version)}
                            disabled={!!dragState || reordering}
                            className="flex-shrink-0 text-red-400 hover:text-red-300 transition-colors disabled:opacity-40"
                            title={`Delete V${idx + 1}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
              {/* Trailing gap — insertion after the last row. */}
              <InsertionLine visible={showGapLine(versions.length)} />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-frame-border">
          {!loading && versions.length > 1 && (
            <p className="text-[11px] text-frame-textMuted text-center leading-relaxed mb-1">
              Drag the ⋮⋮ handle to reorder, or focus it and press ↑ / ↓.
            </p>
          )}
          <button
            onClick={handleClose}
            className="w-full mt-1 py-2 text-sm text-frame-textMuted hover:text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 2px accent bar in the gap between rows. Zero height when invisible so it
 * never shifts layout — only color swaps in when active.
 */
function InsertionLine({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden
      className={[
        'mx-5 rounded-full transition-all pointer-events-none',
        visible ? 'h-0.5 my-1 bg-frame-accent' : 'h-0',
      ].join(' ')}
    />
  );
}
