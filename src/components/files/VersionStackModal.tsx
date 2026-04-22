'use client';

import { useState, useEffect } from 'react';
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

export function VersionStackModal({ asset, onClose, onDeleted, getIdToken }: VersionStackModalProps) {
  const [versions, setVersions] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const confirm = useConfirm();

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
    if (fromIdx === toIdx) return;
    const reordered = [...versions];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setVersions(reordered); // optimistic

    try {
      const token = await getIdToken();
      const res = await fetch('/api/assets/reorder-versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderedIds: reordered.map((v) => v.id) }),
      });
      if (!res.ok) {
        toast.error('Reorder failed');
      }
      // Always re-sync from server — optimistic state may diverge if server
      // rejected partial input or applied a re-root.
      await fetchVersions();
    } catch {
      toast.error('Reorder failed');
      await fetchVersions();
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
            versions.map((version, idx) => {
              const canReorder = versions.length > 1;
              const isDragging = dragIdx === idx;
              const showInsertionAbove =
                hoverIdx === idx && dragIdx !== null && dragIdx !== idx;
              return (
                <div key={version.id}>
                  {/* Insertion line between rows — 2px accent bar that
                      appears at the top of the hovered row while a drag is
                      in flight, showing exactly where the dragged item will
                      land. Keeps the row's own border/padding untouched so
                      it doesn't shift other content around. */}
                  {showInsertionAbove && (
                    <div className="mx-5 h-0.5 bg-frame-accent rounded-full pointer-events-none" />
                  )}
                  <div
                    draggable={canReorder}
                    onDragStart={(e) => {
                      if (!canReorder) return;
                      setDragIdx(idx);
                      e.dataTransfer.effectAllowed = 'move';
                      // Some browsers require data on the transfer object
                      // for the drag to initialize at all.
                      e.dataTransfer.setData('text/plain', version.id);
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      if (dragIdx !== null && dragIdx !== idx) setHoverIdx(idx);
                    }}
                    onDragOver={(e) => {
                      // Required for the drop event to fire; otherwise the
                      // browser rejects the drop. Do NOT update hoverIdx here
                      // — dragOver fires continuously and would re-render on
                      // every mouse move. dragEnter handles the one-shot
                      // update.
                      e.preventDefault();
                    }}
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
                    className={`flex items-center gap-3 px-5 py-3 transition-colors ${
                      isDragging
                        ? 'opacity-50 bg-frame-border/20'
                        : 'hover:bg-frame-border/30'
                    } ${canReorder ? 'cursor-grab active:cursor-grabbing' : ''}`}
                  >
                    {canReorder && (
                      <GripVertical className="w-4 h-4 text-frame-textMuted flex-shrink-0" />
                    )}
                <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded font-mono ${
                  version.id === asset.id
                    ? 'bg-frame-accent text-white'
                    : 'bg-frame-accent/20 text-frame-accent'
                }`}>
                  V{idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white truncate">{version.name}</p>
                    {version.id === asset.id && (
                      <span className="flex-shrink-0 text-[10px] uppercase tracking-wide text-frame-accent font-semibold">Current</span>
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
                      className="flex-shrink-0 text-frame-textMuted hover:text-white transition-colors"
                      title={`Unstack V${idx + 1} — leaves comments and review links intact`}
                    >
                      <Unlink className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(version)}
                      className="flex-shrink-0 text-red-400 hover:text-red-300 transition-colors"
                      title={`Delete V${idx + 1}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
                  </div>
                </div>
              );
            })
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
