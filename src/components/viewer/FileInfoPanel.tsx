'use client';

import type { Asset } from '@/types';

interface FileInfoPanelProps {
  asset: Asset;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
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

function formatDate(ts: { toDate?: () => Date; toMillis?: () => number } | null | undefined): string {
  if (!ts) return '—';
  try {
    const date = typeof ts.toDate === 'function' ? ts.toDate() : new Date((ts as any).seconds * 1000);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

export function FileInfoPanel({ asset }: FileInfoPanelProps) {
  const rows: { label: string; value: string }[] = [
    { label: 'Filename', value: asset.name || '—' },
    { label: 'Type', value: asset.mimeType || '—' },
    { label: 'Size', value: asset.size ? formatBytes(asset.size) : '—' },
    { label: 'Duration', value: asset.duration !== undefined ? formatDuration(asset.duration) : '—' },
    { label: 'Resolution', value: formatResolution(asset.width, asset.height) },
    { label: 'Aspect Ratio', value: formatAspectRatio(asset.width, asset.height) },
    { label: 'FPS', value: (asset as any).fps !== undefined ? String((asset as any).fps) : '—' },
    { label: 'Uploaded by', value: asset.uploadedBy || '—' },
    { label: 'Date', value: formatDate(asset.createdAt as any) },
    { label: 'Version', value: asset.version !== undefined ? `v${asset.version}` : '—' },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <p className="text-xs uppercase tracking-wide text-frame-textMuted mb-4 font-semibold">
        File Information
      </p>
      <dl className="space-y-3">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-0.5">
            <dt className="text-xs text-frame-textSecondary">{label}</dt>
            <dd className="text-sm text-white break-all">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
