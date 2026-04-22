'use client';

import { useState, useRef, useCallback, KeyboardEvent } from 'react';
import { X, Tag, Plus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';

interface TagEditorProps {
  assetId: string;
  /** Current tags for this asset. Parent holds the state; TagEditor reports
      changes via onTagsChange so the parent can reconcile (e.g. refetch). */
  tags: string[];
  onTagsChange: (next: string[]) => void;
}

// Mirror the server-side normalization (TAG_REGEX in /api/assets/[id]/tags):
// lowercase, trimmed, internal whitespace → '-', leading/trailing hyphens
// stripped. Max 32 chars. Empty after normalization → rejected.
function normalize(raw: string): string | null {
  const n = raw.trim().toLowerCase().replace(/\s+/g, '-').replace(/^-+|-+$/g, '');
  if (!n || n.length > 32) return null;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(n)) return null;
  return n;
}

export function TagEditor({ assetId, tags, onTagsChange }: TagEditorProps) {
  const { getIdToken } = useAuth();
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const mutate = useCallback(
    async (addTags: string[], removeTags: string[]) => {
      if (pending) return;
      // Optimistic local update — the parent reconciles once the server
      // response arrives. Failures roll back to the original list.
      const optimistic = new Set(tags);
      for (const t of addTags) optimistic.add(t);
      for (const t of removeTags) optimistic.delete(t);
      const optimisticList = Array.from(optimistic);
      onTagsChange(optimisticList);

      setPending(true);
      try {
        const token = await getIdToken();
        const res = await fetch(`/api/assets/${assetId}/tags`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ addTags, removeTags }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Tag update failed' }));
          onTagsChange(tags);
          toast.error(body.error || 'Tag update failed');
          return;
        }
        const body = (await res.json()) as { tags: string[] };
        onTagsChange(body.tags ?? []);
      } catch {
        onTagsChange(tags);
        toast.error('Tag update failed');
      } finally {
        setPending(false);
      }
    },
    [assetId, tags, onTagsChange, getIdToken, pending],
  );

  const commit = useCallback(() => {
    const norm = normalize(input);
    if (!norm) {
      if (input.trim()) toast.error('Tags: lowercase letters, numbers, hyphens (1–32 chars)');
      setInput('');
      return;
    }
    if (tags.includes(norm)) {
      setInput('');
      return;
    }
    setInput('');
    void mutate([norm], []);
  }, [input, tags, mutate]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      // Empty input + backspace removes the last tag — matches Gmail/Linear UX.
      e.preventDefault();
      const last = tags[tags.length - 1];
      void mutate([], [last]);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Tag className="w-3 h-3 text-frame-textMuted" />
        <span className="text-[10px] font-semibold text-frame-textMuted uppercase tracking-wider">
          Tags
        </span>
      </div>
      <div
        className="flex flex-wrap items-center gap-1.5 min-h-[28px] px-2 py-1 bg-frame-bg border border-frame-border rounded-lg focus-within:border-frame-accent transition-colors cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-frame-accent/15 text-frame-accent text-xs font-medium rounded-md"
          >
            {tag}
            <button
              type="button"
              disabled={pending}
              onClick={(e) => {
                e.stopPropagation();
                void mutate([], [tag]);
              }}
              aria-label={`Remove tag ${tag}`}
              className="hover:text-white transition-colors disabled:opacity-50"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onBlur={() => input && commit()}
          onKeyDown={handleKeyDown}
          disabled={pending}
          placeholder={tags.length === 0 ? 'Add tag…' : ''}
          aria-label="Add tag"
          className="flex-1 min-w-[80px] bg-transparent text-xs text-white placeholder-frame-textMuted focus:outline-none py-1"
        />
        {input && (
          <button
            type="button"
            onClick={commit}
            disabled={pending}
            aria-label="Add tag"
            className="text-frame-accent hover:text-frame-accentHover transition-colors disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
