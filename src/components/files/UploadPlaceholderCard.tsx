'use client';

import { Loader2, AlertCircle } from 'lucide-react';
import { formatBytes, formatRelativeTime } from '@/lib/utils';
import type { UploadItem } from '@/types';

interface UploadPlaceholderCardProps {
  item: UploadItem;
}

/**
 * Optimistic grid card rendered while a file is being uploaded. Lives in
 * `AssetGrid` above the real asset cards so the user sees immediate visual
 * feedback when they drop a file — instead of staring at the old grid and
 * wondering if anything happened. Replaced by the real `AssetCard` once the
 * refetch lands with the new asset.
 *
 * Non-interactive: no click / context-menu / drag handlers. The only way to
 * cancel is via the bottom-right upload progress panel (which is still the
 * authoritative control surface for the upload queue).
 */
export function UploadPlaceholderCard({ item }: UploadPlaceholderCardProps) {
  const isError = item.status === 'error';
  const isComplete = item.status === 'complete';
  const timeLabel = formatRelativeTime(new Date(item.createdAt));

  return (
    <div
      className="group bg-frame-card rounded-xl overflow-hidden opacity-80 cursor-wait select-none"
      data-testid="upload-placeholder"
    >
      {/* Thumbnail area — spinner (or error icon) centered, with a
          progress ring/percentage when uploading. */}
      <div className="relative aspect-video bg-black/60 overflow-hidden flex items-center justify-center">
        {isError ? (
          <div className="flex flex-col items-center gap-2">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <span className="text-[10px] text-red-300 font-medium uppercase tracking-wider">
              Upload failed
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 text-frame-accent animate-spin" />
            <span className="text-xs font-mono text-white/80 tabular-nums">
              {isComplete ? 'Processing…' : `${item.progress}%`}
            </span>
          </div>
        )}

        {/* Bottom progress bar — fills as the upload advances */}
        {!isError && (
          <div className="absolute left-0 right-0 bottom-0 h-1 bg-black/50">
            <div
              className="h-full bg-frame-accent transition-[width] duration-150 ease-out"
              style={{ width: `${isComplete ? 100 : item.progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Info row — mirrors AssetCard's layout so the placeholder doesn't
          "jump" when the real card replaces it. */}
      <div className="p-3">
        <p className="text-sm font-medium text-white truncate" title={item.file.name}>
          {item.file.name}
        </p>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-frame-textMuted">{formatBytes(item.file.size)}</p>
          <span className="text-[10px] font-semibold text-frame-accent uppercase tracking-wider">
            {isError ? 'Failed' : isComplete ? 'Finalizing' : 'Uploading'}
          </span>
        </div>
        <p className="text-xs text-frame-textMuted mt-0.5">{timeLabel}</p>
      </div>
    </div>
  );
}
