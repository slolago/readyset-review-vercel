'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { Copy, Check, Link, ExternalLink, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

interface CreateReviewLinkModalProps {
  projectId: string;
  folderId?: string | null;
  assetIds?: string[];
  onClose: () => void;
}

export function CreateReviewLinkModal({
  projectId,
  folderId,
  assetIds,
  onClose,
}: CreateReviewLinkModalProps) {
  const { getIdToken } = useAuth();
  const [name, setName] = useState('Review Link');
  const [allowComments, setAllowComments] = useState(true);
  const [allowDownloads, setAllowDownloads] = useState(false);
  const [allowApprovals, setAllowApprovals] = useState(false);
  const [showAllVersions, setShowAllVersions] = useState(false);
  const [password, setPassword] = useState('');
  const [expiresIn, setExpiresIn] = useState<'never' | '1d' | '7d' | '30d'>('never');
  // Tracks which flow is currently loading so the right spinner label
  // shows on the right button. null when idle.
  const [loading, setLoading] = useState<null | 'normal' | 'metadata'>(null);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = async (applyMetadata: boolean) => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    setLoading(applyMetadata ? 'metadata' : 'normal');
    try {
      const token = await getIdToken();
      const res = await fetch('/api/review-links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          projectId,
          folderId: assetIds?.length ? null : (folderId || null),
          assetIds: assetIds?.length ? assetIds : undefined,
          allowComments,
          allowDownloads,
          allowApprovals,
          showAllVersions,
          password: password || undefined,
          applyMetadata,
          expiresAt: (() => {
            if (expiresIn === 'never') return undefined;
            const ms = { '1d': 86400000, '7d': 604800000, '30d': 2592000000 }[expiresIn];
            return new Date(Date.now() + ms).toISOString();
          })(),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Failed to create review link (${res.status})`);
      }
      const data = await res.json();
      const url = `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/review/${data.link.token}`;
      setCreatedLink(url);
      toast.success(
        applyMetadata
          ? 'Review link created with Meta metadata applied!'
          : 'Review link created!',
      );
    } catch (err) {
      toast.error((err as Error).message || 'Failed to create review link');
    } finally {
      setLoading(null);
    }
  };

  const handleCopy = async () => {
    if (!createdLink) return;
    await navigator.clipboard.writeText(createdLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Link copied!');
  };

  return (
    <Modal isOpen onClose={onClose} title="Create Review Link" size="md">
      {createdLink ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-frame-green/10 border border-frame-green/20 rounded-xl">
            <Check className="w-5 h-5 text-frame-green flex-shrink-0" />
            <p className="text-sm text-frame-green font-medium">Review link created!</p>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 px-3 py-2.5 bg-frame-bg border border-frame-border rounded-lg">
              <p className="text-xs text-frame-textMuted truncate">{createdLink}</p>
            </div>
            <button
              onClick={handleCopy}
              className="px-3 py-2 bg-frame-card hover:bg-frame-cardHover border border-frame-border rounded-lg text-frame-textSecondary hover:text-white transition-colors flex items-center gap-1.5 text-sm"
            >
              {copied ? <Check className="w-4 h-4 text-frame-green" /> : <Copy className="w-4 h-4" />}
            </button>
            <a
              href={createdLink}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 bg-frame-card hover:bg-frame-cardHover border border-frame-border rounded-lg text-frame-textSecondary hover:text-white transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          <Button variant="secondary" onClick={onClose} className="w-full">
            Done
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            // Default submit (Enter key) creates a normal link without
            // metadata. Users who want metadata click the second button
            // explicitly.
            if (!loading) handleCreate(false);
          }}
          className="space-y-4"
        >
          {assetIds?.length ? (
            <p className="text-xs text-frame-textMuted mb-3">This link will include {assetIds.length} selected asset{assetIds.length !== 1 ? 's' : ''}.</p>
          ) : null}
          <Input
            label="Link name"
            placeholder="e.g. Client Review v1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <div className="space-y-1 divide-y divide-frame-border/40">
            <div className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">Allow comments</p>
                <p className="text-xs text-frame-textMuted mt-0.5">
                  Viewers can leave comments and annotations
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAllowComments((v) => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                  allowComments ? 'bg-frame-accent' : 'bg-frame-border'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                    allowComments ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">Allow downloads</p>
                <p className="text-xs text-frame-textMuted mt-0.5">
                  Viewers can download the original files
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAllowDownloads((v) => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                  allowDownloads ? 'bg-frame-accent' : 'bg-frame-border'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                    allowDownloads ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">Allow approvals</p>
                <p className="text-xs text-frame-textMuted mt-0.5">
                  Viewers can approve or request changes
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAllowApprovals((v) => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                  allowApprovals ? 'bg-frame-accent' : 'bg-frame-border'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                    allowApprovals ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">Show all versions</p>
                <p className="text-xs text-frame-textMuted mt-0.5">
                  Viewers see all asset versions, not just the latest
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAllVersions((v) => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                  showAllVersions ? 'bg-frame-accent' : 'bg-frame-border'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                    showAllVersions ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-frame-textSecondary mb-1.5">Expires</label>
            <div className="grid grid-cols-4 gap-1.5">
              {([
                { v: 'never', label: 'Never' },
                { v: '1d',    label: '1 day' },
                { v: '7d',    label: '7 days' },
                { v: '30d',   label: '30 days' },
              ] as const).map(({ v, label }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setExpiresIn(v)}
                  className={`min-w-0 px-1 py-1.5 text-xs rounded-lg border transition-colors truncate ${
                    expiresIn === v
                      ? 'bg-frame-accent/15 border-frame-accent text-frame-accent'
                      : 'border-frame-border text-frame-textSecondary hover:text-white hover:border-frame-borderLight'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <Input
            label="Password (optional)"
            type="password"
            placeholder="Leave empty for no password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {/* Two-button CTA — normal vs with-metadata.
              - "Create Link" → fast; no stamp jobs fired; matches
                pre-v2.4 behavior. Default (Enter-key submit).
              - "Create + Apply Metadata" → fires the exiftool stamp
                pipeline for every directly-exposed asset; parent POST
                awaits all stamps; can take 15-60s per mid-sized video.
                Guests receive stamped URLs once ready. */}
          <div className="space-y-2 pt-2">
            <div className="flex gap-3">
              <Button type="button" variant="secondary" onClick={onClose} className="flex-1" disabled={loading !== null}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={loading === 'normal'}
                disabled={loading !== null}
                icon={<Link className="w-4 h-4" />}
                className="flex-1"
              >
                {loading === 'normal' ? 'Creating…' : 'Create Link'}
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              loading={loading === 'metadata'}
              disabled={loading !== null}
              onClick={() => handleCreate(true)}
              icon={<Sparkles className="w-4 h-4" />}
              className="w-full"
            >
              {loading === 'metadata' ? 'Applying metadata…' : 'Create + Apply Meta Metadata'}
            </Button>
            <p className="text-[10px] text-frame-textMuted leading-snug pt-1">
              {loading === 'metadata'
                ? 'Stamping each asset with Meta XMP attribution — this may take up to a minute per video.'
                : 'Metadata stamp embeds Meta Ads attribution (Attrib XMP namespace) in every asset the guest receives. Leave off for fast standard delivery.'}
            </p>
          </div>
        </form>
      )}
    </Modal>
  );
}
