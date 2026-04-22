'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { AssetCard } from './AssetCard';
import { UploadPlaceholderCard } from './UploadPlaceholderCard';
import type { Asset, UploadItem } from '@/types';

interface AssetGridProps {
  assets: Asset[];
  projectId: string;
  /** Active uploads targeting THIS folder — rendered as optimistic
      placeholder cards before the real asset cards so the user sees
      immediate feedback when they drop a file. Filtered by the parent
      (FolderBrowser) to only include pending/uploading uploads in the
      current view. */
  uploadPlaceholders?: UploadItem[];
  onAssetDeleted?: () => void;
  onVersionUploaded?: () => void;
  onCopied?: () => void;
  onDuplicated?: () => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string, e: React.MouseEvent) => void;
  onAssetDragStart?: (assetId: string, e: React.DragEvent) => void;
  onRequestMove?: (assetId: string) => void;
  onCreateReviewLink?: (assetId: string) => void;
  onAddToReviewLink?: (assetId: string) => void;
  dragOverAssetId?: string | null;
  onAssetDragOver?: (assetId: string, e: React.DragEvent) => void;
  onAssetDragLeave?: (assetId: string, e: React.DragEvent) => void;
  onAssetDrop?: (assetId: string, e: React.DragEvent) => void;
}

export const AssetGrid = React.memo(function AssetGrid({
  assets,
  projectId,
  uploadPlaceholders,
  onAssetDeleted,
  onVersionUploaded,
  onCopied,
  onDuplicated,
  selectedIds,
  onToggleSelect,
  onAssetDragStart,
  onRequestMove,
  onCreateReviewLink,
  onAddToReviewLink,
  dragOverAssetId,
  onAssetDragOver,
  onAssetDragLeave,
  onAssetDrop,
}: AssetGridProps) {
  const router = useRouter();

  const placeholders = uploadPlaceholders ?? [];
  if (assets.length === 0 && placeholders.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-semibold text-frame-textMuted uppercase tracking-wider mb-3">
        Assets ({assets.length + placeholders.length})
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {placeholders.map((item) => (
          <UploadPlaceholderCard key={`upload-${item.id}`} item={item} />
        ))}
        {assets.map((asset) => (
          <AssetCard
            key={asset.id}
            asset={asset}
            onClick={() => router.push(`/projects/${projectId}/assets/${asset.id}`)}
            onDeleted={onAssetDeleted}
            onVersionUploaded={onVersionUploaded}
            onCopied={onCopied}
            onDuplicated={onDuplicated}
            isSelected={selectedIds?.has(asset.id)}
            onToggleSelect={onToggleSelect ? (e) => onToggleSelect(asset.id, e) : undefined}
            onDragStart={onAssetDragStart ? (e) => onAssetDragStart(asset.id, e) : undefined}
            onRequestMove={onRequestMove ? () => onRequestMove(asset.id) : undefined}
            onCreateReviewLink={onCreateReviewLink ? () => onCreateReviewLink(asset.id) : undefined}
            onAddToReviewLink={onAddToReviewLink ? () => onAddToReviewLink(asset.id) : undefined}
            isDropTarget={dragOverAssetId === asset.id}
            onDragOver={onAssetDragOver ? (e) => onAssetDragOver(asset.id, e) : undefined}
            onDragLeave={onAssetDragLeave ? (e) => onAssetDragLeave(asset.id, e) : undefined}
            onDrop={onAssetDrop ? (e) => onAssetDrop(asset.id, e) : undefined}
            folderSiblings={assets}
          />
        ))}
      </div>
    </div>
  );
});
