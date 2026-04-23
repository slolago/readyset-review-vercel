'use client';

import { useState, useEffect } from 'react';
import type { Asset } from '@/types';
import { useUserNames } from '@/hooks/useUserNames';
import { useAuth } from '@/hooks/useAuth';
import { RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDate } from '@/lib/format-date';
import { TagEditor } from './TagEditor';
import { RatingStars } from '@/components/ui/RatingStars';

interface FileInfoPanelProps {
  asset: Asset;
  /**
   * Guest (review-link) mode. Hides internal-only affordances:
   *   - Probe button (requires auth + write permission)
   *   - Tag editor (guests can't edit tags)
   *   - Rating editor (guests can't edit ratings)
   * The panel still shows uploader / date / codec / etc. — guests can
   * see the asset's metadata, they just can't mutate it.
   */
  isGuest?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatBitrate(bps: number): string {
  if (!bps) return '—';
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} kbps`;
  return `${bps} bps`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
  const base = h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
  return ms > 0 && h === 0 ? `${base}.${String(ms).padStart(3, '0').slice(0, 2)}` : base;
}

function formatResolution(width?: number, height?: number): string {
  if (!width || !height) return '—';
  return `${width} × ${height}`;
}

function formatAspectRatio(width?: number, height?: number): string {
  if (!width || !height) return '—';
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function formatSampleRate(hz?: number): string {
  if (!hz) return '—';
  if (hz >= 1000) return `${(hz / 1000).toFixed(1).replace(/\.0$/, '')} kHz`;
  return `${hz} Hz`;
}

function formatChannels(n?: number, layout?: string): string {
  if (!n) return '—';
  const base = n === 1 ? 'Mono' : n === 2 ? 'Stereo' : `${n} channels`;
  if (layout && layout !== 'stereo' && layout !== 'mono') return `${base} (${layout})`;
  return base;
}

function formatCodec(codec?: string, profile?: string, level?: number): string {
  if (!codec) return '—';
  const parts = [codec.toUpperCase()];
  if (profile) parts.push(profile);
  if (level !== undefined) parts.push(`L${(level / 10).toFixed(1)}`);
  return parts.join(' · ');
}

function formatContainer(fmt?: string): string {
  if (!fmt) return '—';
  // ffprobe returns comma-separated list; show the first meaningful one
  const parts = fmt.split(',').map((s) => s.trim()).filter(Boolean);
  // Prefer mp4 > mov > others for the common tuple
  const preferred = parts.find((p) => ['mp4', 'mov', 'mkv', 'webm', 'avi'].includes(p));
  return (preferred ?? parts[0] ?? fmt).toUpperCase();
}

interface Row { label: string; value: string; }
interface Section { title: string; rows: Row[]; }

export function FileInfoPanel({ asset, isGuest = false }: FileInfoPanelProps) {
  const { getIdToken } = useAuth();
  // Skip the useUserNames hook for guests — it hits /api/users (auth-gated)
  // and returns empty for guests, so the UID bleeds through as the display
  // name. Review-link API resolves uploadedByName server-side and includes
  // it on each asset in the response instead.
  const uploaderNames = useUserNames(!isGuest && asset.uploadedBy ? [asset.uploadedBy] : []);
  const uploaderFromServer = (asset as unknown as { uploadedByName?: string }).uploadedByName;
  const uploaderLabel =
    uploaderFromServer ||
    (asset.uploadedBy && uploaderNames[asset.uploadedBy]) ||
    (isGuest ? '—' : asset.uploadedBy) ||
    '—';
  const [probing, setProbing] = useState(false);
  // Local copy of tags so TagEditor's optimistic updates show immediately
  // without waiting for the parent to refetch the asset. Re-syncs when the
  // user switches to a different asset (asset.id change).
  const [tags, setTags] = useState<string[]>(asset.tags ?? []);
  useEffect(() => {
    setTags(asset.tags ?? []);
  }, [asset.id, asset.tags]);

  // Local rating state — optimistic update pattern matches TagEditor. Re-syncs
  // when switching assets. The PUT call fires on change; on failure we revert.
  const [rating, setRating] = useState<number>(asset.rating ?? 0);
  const [savingRating, setSavingRating] = useState(false);
  useEffect(() => {
    setRating(asset.rating ?? 0);
  }, [asset.id, asset.rating]);

  const handleRatingChange = async (next: number) => {
    if (savingRating || next === rating) return;
    const prev = rating;
    setRating(next); // optimistic
    setSavingRating(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        // Server translates 0 → FieldValue.delete() via the null coercion path.
        body: JSON.stringify({ rating: next === 0 ? null : next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Failed to save rating');
      }
    } catch (e) {
      setRating(prev); // revert
      toast.error((e as Error).message);
    } finally {
      setSavingRating(false);
    }
  };

  const runProbe = async () => {
    setProbing(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/assets/${asset.id}/probe`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error || 'Probe failed');
      }
      toast.success('Metadata refreshed — reload to see');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setProbing(false);
    }
  };

  const sections: Section[] = [];

  if (asset.type === 'video') {
    sections.push({
      title: 'File',
      rows: [
        { label: 'Filename', value: asset.name || '—' },
        { label: 'Type', value: asset.mimeType || '—' },
        { label: 'Container', value: formatContainer(asset.containerFormat) },
        { label: 'Size', value: asset.size ? formatBytes(asset.size) : '—' },
        { label: 'Overall bitrate', value: asset.bitRate ? formatBitrate(asset.bitRate) : '—' },
      ],
    });
    sections.push({
      title: 'Video',
      rows: [
        { label: 'Duration', value: asset.duration !== undefined ? formatDuration(asset.duration) : '—' },
        { label: 'Codec', value: formatCodec(asset.videoCodec, asset.profile, asset.level) },
        { label: 'Resolution', value: formatResolution(asset.width, asset.height) },
        { label: 'Aspect ratio', value: formatAspectRatio(asset.width, asset.height) },
        { label: 'Frame rate', value: asset.frameRate !== undefined ? `${asset.frameRate} fps` : '—' },
        { label: 'Video bitrate', value: asset.videoBitRate ? formatBitrate(asset.videoBitRate) : '—' },
        { label: 'Pixel format', value: asset.pixelFormat || '—' },
        { label: 'Color space', value: asset.colorSpace || '—' },
        { label: 'Color primaries', value: asset.colorPrimaries || '—' },
        { label: 'Color transfer', value: asset.colorTransfer || '—' },
        ...(asset.rotation ? [{ label: 'Rotation', value: `${asset.rotation}°` }] : []),
      ],
    });

    // Audio section — only if we have any audio metadata
    if (asset.audioCodec || asset.audioChannels || asset.audioSampleRate || asset.audioBitRate) {
      sections.push({
        title: 'Audio',
        rows: [
          { label: 'Codec', value: (asset.audioCodec ?? '—').toUpperCase() },
          { label: 'Channels', value: formatChannels(asset.audioChannels, asset.audioChannelLayout) },
          { label: 'Sample rate', value: formatSampleRate(asset.audioSampleRate) },
          { label: 'Audio bitrate', value: asset.audioBitRate ? formatBitrate(asset.audioBitRate) : '—' },
        ],
      });
    }
  }

  if (asset.type !== 'video') {
    // image (and any future non-video type) — no Container / bitrate / pixel-format
    sections.push({
      title: 'File',
      rows: [
        { label: 'Filename', value: asset.name || '—' },
        { label: 'Type', value: asset.mimeType || '—' },
        { label: 'Size', value: asset.size ? formatBytes(asset.size) : '—' },
      ],
    });
    sections.push({
      title: 'Image',
      rows: [
        { label: 'Resolution', value: formatResolution(asset.width, asset.height) },
        { label: 'Aspect ratio', value: formatAspectRatio(asset.width, asset.height) },
        ...(asset.colorSpace ? [{ label: 'Color space', value: asset.colorSpace }] : []),
      ],
    });
  }

  sections.push({
    title: 'Upload',
    rows: [
      { label: 'Uploaded by', value: uploaderLabel },
      { label: 'Date', value: formatDate(asset.createdAt) },
      { label: 'Version', value: asset.version !== undefined ? `v${asset.version}` : '—' },
    ],
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-frame-textMuted font-semibold">
          File Information
        </p>
        {asset.type === 'video' && !isGuest && (
          <button
            onClick={runProbe}
            disabled={probing}
            title={asset.probed ? 'Re-probe metadata with ffprobe' : 'Extract accurate metadata with ffprobe'}
            className="flex items-center gap-1 text-xs text-frame-textMuted hover:text-frame-accent transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${probing ? 'animate-spin' : ''}`} />
            {probing ? 'Probing…' : asset.probed ? 'Re-probe' : 'Probe'}
          </button>
        )}
      </div>

      {asset.type === 'video' && !asset.probed && !isGuest && (
        <p className="text-[11px] text-frame-textMuted -mt-3 leading-snug">
          Some fields may be inaccurate — client-extracted. Click Probe for server-verified metadata.
        </p>
      )}

      {!isGuest && (
        <>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-frame-textMuted mb-2 font-semibold">
              Rating
            </p>
            <div className="flex items-center gap-3">
              <RatingStars value={rating} onChange={handleRatingChange} size="md" />
              {rating > 0 && (
                <button
                  type="button"
                  onClick={() => handleRatingChange(0)}
                  disabled={savingRating}
                  className="text-[11px] text-frame-textMuted hover:text-white transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <TagEditor assetId={asset.id} tags={tags} onTagsChange={setTags} />
        </>
      )}

      {sections.map((section) => (
        <div key={section.title}>
          <p className="text-[10px] uppercase tracking-wider text-frame-textMuted mb-2 font-semibold">
            {section.title}
          </p>
          <dl className="space-y-2">
            {section.rows.map(({ label, value }) => (
              <div key={label} className="flex justify-between gap-3 items-baseline">
                <dt className="text-xs text-frame-textSecondary flex-shrink-0">{label}</dt>
                <dd className="text-xs text-white text-right break-all font-mono tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
