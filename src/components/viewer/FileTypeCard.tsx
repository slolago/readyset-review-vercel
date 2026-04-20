'use client';

/**
 * Fallback viewer for non-previewable types (archives, fonts, design files,
 * and any future document subtypes not yet wired to an inline viewer).
 * Renders a centered card with icon + metadata + download button.
 */
import {
  FileArchive,
  FileText,
  FileCode,
  Type,
  Palette,
  Film,
  Image as ImageIcon,
  Download,
  User,
  Calendar,
} from 'lucide-react';
import type { Asset } from '@/types';
import { formatBytes, forceDownload } from '@/lib/utils';
import { TYPE_META, type IconName } from '@/lib/file-types';
import { useUserNames } from '@/hooks/useUserNames';

// Local string→component binding. Intentional duplicate of the map in
// AssetCard/AssetListView — keeps `file-types.ts` framework-agnostic.
const ICON_COMPONENTS: Record<IconName, React.ComponentType<{ className?: string }>> = {
  Film,
  Image: ImageIcon,
  FileText,
  FileCode,
  FileArchive,
  Type,
  Palette,
};

interface Props {
  asset: Asset;
}

export function FileTypeCard({ asset }: Props) {
  const names = useUserNames(asset.uploadedBy ? [asset.uploadedBy] : []);
  const uploaderName = asset.uploadedBy ? (names[asset.uploadedBy] || '') : '';

  const downloadUrl = (asset as any).downloadUrl as string | undefined;
  const signedUrl = (asset as any).signedUrl as string | undefined;

  const handleDownload = () => {
    const url = downloadUrl ?? signedUrl;
    if (!url) return;
    forceDownload(url, asset.name);
  };

  const uploadDate: Date | null =
    typeof (asset.createdAt as any)?.toDate === 'function'
      ? (asset.createdAt as any).toDate()
      : (asset.createdAt as any)?._seconds
      ? new Date((asset.createdAt as any)._seconds * 1000)
      : null;
  const uploadDateLabel = uploadDate
    ? uploadDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  const meta = TYPE_META[asset.type];
  const Icon = ICON_COMPONENTS[meta.iconName];

  return (
    <div className="w-full h-full flex items-center justify-center p-8">
      <div className="bg-frame-card border border-frame-border rounded-xl p-8 max-w-md w-full flex flex-col items-center gap-4">
        <Icon className="w-20 h-20 text-frame-accent" />

        <div className="w-full text-center">
          <p className="text-base font-semibold text-white truncate" title={asset.name}>
            {asset.name}
          </p>
          {asset.subtype && (
            <span className="inline-block mt-2 px-2 py-0.5 bg-frame-bg rounded text-[10px] font-mono uppercase text-frame-textSecondary tracking-wide">
              .{asset.subtype}
            </span>
          )}
        </div>

        <div className="w-full space-y-1.5 text-sm text-frame-textSecondary">
          <div className="flex items-center justify-between">
            <span className="text-frame-textMuted">Size</span>
            <span>{formatBytes(asset.size)}</span>
          </div>
          {uploaderName && (
            <div className="flex items-center justify-between">
              <span className="text-frame-textMuted flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                Uploaded by
              </span>
              <span className="truncate max-w-[180px]" title={uploaderName}>{uploaderName}</span>
            </div>
          )}
          {uploadDateLabel && (
            <div className="flex items-center justify-between">
              <span className="text-frame-textMuted flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Uploaded
              </span>
              <span>{uploadDateLabel}</span>
            </div>
          )}
        </div>

        <button
          onClick={handleDownload}
          disabled={!downloadUrl && !signedUrl}
          className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2 bg-frame-accent hover:bg-frame-accentHover disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Download className="w-4 h-4" />
          Download
        </button>
      </div>
    </div>
  );
}
