'use client';

import { useState, useEffect } from 'react';
import { Copy, ExternalLink, Pencil, Trash2, Link } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/ui/Spinner';
import type { ReviewLink } from '@/types';
import toast from 'react-hot-toast';

interface ReviewLinksTabProps {
  projectId: string;
}

export function ReviewLinksTab({ projectId }: ReviewLinksTabProps) {
  const { getIdToken } = useAuth();
  const [links, setLinks] = useState<ReviewLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const linkUrl = (token: string) =>
    `${window.location.origin}/review/${token}`;

  const fetchLinks = async () => {
    try {
      setLoading(true);
      const token = await getIdToken();
      const res = await fetch(`/api/review-links?projectId=${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load review links');
      const data = await res.json();
      setLinks(data.links ?? []);
    } catch {
      toast.error('Failed to load review links');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(linkUrl(token));
      toast.success('Link copied!');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const startRename = (link: ReviewLink) => {
    setRenamingId(link.id);
    setRenameValue(link.name);
  };

  const commitRename = async () => {
    if (!renamingId || !renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    const linkToRename = links.find((l) => l.id === renamingId);
    if (!linkToRename) {
      setRenamingId(null);
      return;
    }
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/review-links/${linkToRename.token}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (!res.ok) throw new Error('Failed to rename');
      await fetchLinks();
    } catch {
      toast.error('Failed to rename review link');
    } finally {
      setRenamingId(null);
    }
  };

  const handleDelete = async (link: ReviewLink) => {
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/review-links/${link.token}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete');
      setLinks((prev) => prev.filter((l) => l.id !== link.id));
      toast.success('Review link deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  return (
    <div className="p-8 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Review Links</h2>
        <p className="text-sm text-frame-textMuted">
          {links.length} link{links.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Loading */}
      {loading && <Spinner />}

      {/* Empty state */}
      {!loading && links.length === 0 && (
        <div className="text-center py-16 text-frame-textMuted">
          <Link className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No review links yet</p>
          <p className="text-xs mt-1">Create one from the Share button or a folder menu</p>
        </div>
      )}

      {/* Links list */}
      {!loading && links.length > 0 && (
        <div className="space-y-2">
          {links.map((link) => (
            <div
              key={link.id}
              className="flex items-center gap-3 p-3 bg-frame-card border border-frame-border rounded-xl hover:bg-frame-cardHover transition-colors"
            >
              {/* Name — inline rename */}
              <div className="flex-1 min-w-0">
                {renamingId === link.id ? (
                  <input
                    autoFocus
                    className="w-full bg-frame-bg border border-frame-accent rounded px-2 py-0.5 text-sm text-white outline-none focus:ring-1 focus:ring-frame-accent"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onBlur={commitRename}
                  />
                ) : (
                  <p className="text-sm font-medium text-white truncate">{link.name}</p>
                )}
                <p className="text-xs text-frame-textMuted truncate mt-0.5">
                  {linkUrl(link.token)}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Copy */}
                <button
                  title="Copy link"
                  onClick={() => handleCopy(link.token)}
                  className="w-8 h-8 flex items-center justify-center rounded text-frame-textMuted hover:text-white hover:bg-frame-border transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>

                {/* Open in new tab */}
                <a
                  href={linkUrl(link.token)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open review link"
                  className="w-8 h-8 flex items-center justify-center rounded text-frame-textMuted hover:text-white hover:bg-frame-border transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>

                {/* Rename */}
                <button
                  title="Rename"
                  onClick={() => startRename(link)}
                  className="w-8 h-8 flex items-center justify-center rounded text-frame-textMuted hover:text-white hover:bg-frame-border transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>

                {/* Delete */}
                <button
                  title="Delete"
                  onClick={() => handleDelete(link)}
                  className="w-8 h-8 flex items-center justify-center rounded text-frame-textMuted hover:text-red-400 hover:bg-frame-border transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
