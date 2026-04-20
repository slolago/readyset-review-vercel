'use client';

import { useMemo, useState } from 'react';
import { X, Layers, Film, Image as ImageIcon } from 'lucide-react';
import type { Asset } from '@/types';

interface StackOntoModalProps {
  /** The asset being stacked onto another. */
  source: Asset;
  /** All sibling assets in the same folder. Modal filters out source and its group. */
  candidates: Asset[];
  onPick: (targetId: string) => void;
  onClose: () => void;
}

export function StackOntoModal({ source, candidates, onPick, onClose }: StackOntoModalProps) {
  const [query, setQuery] = useState('');

  const sourceGroupId = source.versionGroupId || source.id;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates.filter((c) => {
      if (c.id === source.id) return false;
      // Exclude any asset already in the same version group as source
      const cGroup = c.versionGroupId || c.id;
      if (cGroup === sourceGroupId) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [candidates, source.id, sourceGroupId, query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-frame-card border border-frame-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-frame-border">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-frame-accent" />
            <h3 className="text-sm font-semibold text-white">Stack onto</h3>
          </div>
          <button onClick={onClose} className="text-frame-textMuted hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-frame-border">
          <p className="text-xs text-frame-textMuted mb-2 truncate">
            Stacking <span className="text-white">{source.name}</span> onto…
          </p>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search siblings…"
            className="w-full bg-frame-bg border border-frame-border rounded px-2 py-1.5 text-sm text-white outline-none focus:border-frame-accent"
          />
        </div>

        <div className="max-h-64 overflow-y-auto py-2">
          {visible.length === 0 ? (
            <p className="text-center text-sm text-frame-textMuted py-8">No eligible siblings.</p>
          ) : (
            visible.map((c) => (
              <button
                key={c.id}
                onClick={() => onPick(c.id)}
                className="w-full flex items-center gap-2 px-5 py-2.5 text-sm text-frame-textSecondary hover:text-white hover:bg-frame-border/50 transition-colors text-left"
              >
                {c.type === 'video' ? (
                  <Film className="w-4 h-4 flex-shrink-0 text-frame-textMuted" />
                ) : (
                  <ImageIcon className="w-4 h-4 flex-shrink-0 text-frame-textMuted" />
                )}
                <span className="truncate">{c.name}</span>
              </button>
            ))
          )}
        </div>

        <div className="px-5 py-3 border-t border-frame-border">
          <button
            onClick={onClose}
            className="w-full py-2 text-sm text-frame-textMuted hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
