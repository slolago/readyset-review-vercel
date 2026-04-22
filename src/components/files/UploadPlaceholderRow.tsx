'use client';

import { Loader2, AlertCircle } from 'lucide-react';
import { formatBytes, formatRelativeTime } from '@/lib/utils';
import type { UploadItem } from '@/types';

interface UploadPlaceholderRowProps {
  item: UploadItem;
  /** Mirrors the parent `AssetListView`'s conditional checkbox column.
      When true, a leading empty `<td>` keeps our thumbnail/name column
      aligned with the real rows below. */
  hasCheckboxColumn?: boolean;
}

/**
 * List-view equivalent of UploadPlaceholderCard. Renders as a banner-style
 * table row (using colSpan) that spans the rest of the columns after the
 * thumbnail — the real asset rows have columns for Review / Comments /
 * Versions / Size / Date / Uploaded by, all of which are N/A until the
 * asset is materialized. A single compact info block is clearer than
 * rendering `—` in every column.
 */
export function UploadPlaceholderRow({ item, hasCheckboxColumn }: UploadPlaceholderRowProps) {
  const isError = item.status === 'error';
  const isComplete = item.status === 'complete';
  const timeLabel = formatRelativeTime(new Date(item.createdAt));

  return (
    <tr
      className="border-b border-frame-border opacity-80 cursor-wait select-none"
      data-testid="upload-placeholder-row"
    >
      {hasCheckboxColumn && <td className="px-3 py-2 w-10" />}
      <td className="px-3 py-2 w-12">
        <div className="w-10 h-10 rounded-md bg-black/60 flex items-center justify-center">
          {isError ? (
            <AlertCircle className="w-5 h-5 text-red-400" />
          ) : (
            <Loader2 className="w-5 h-5 text-frame-accent animate-spin" />
          )}
        </div>
      </td>
      {/* colSpan=7 covers Name / Review / Comments / Versions / Size / Date / Uploaded by */}
      <td className="px-3 py-2" colSpan={7}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate" title={item.file.name}>
              {item.file.name}
            </p>
            <p className="text-xs text-frame-textMuted">
              {formatBytes(item.file.size)} · {timeLabel}
            </p>
          </div>
          <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
            <span className="text-[10px] font-semibold text-frame-accent uppercase tracking-wider">
              {isError ? 'Failed' : isComplete ? 'Finalizing' : `Uploading ${item.progress}%`}
            </span>
            {!isError && (
              <div className="w-24 h-1 bg-black/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-frame-accent transition-[width] duration-150 ease-out"
                  style={{ width: `${isComplete ? 100 : item.progress}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}
