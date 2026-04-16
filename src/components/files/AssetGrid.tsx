'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { AssetCard } from './AssetCard';
import type { Asset } from '@/types';

interface AssetGridProps {
  assets: Asset[];
  projectId: string;
  onAssetDeleted?: () => void;
  onVersionUploaded?: () => void;
  onCopied?: () => void;
  onDuplicated?: () => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string, e: React.MouseEvent) => void;
  onAssetDragStart?: (assetId: string, e: React.DragEvent) => void;
  onRequestMove?: (assetId: string) => void;
  onCreateReviewLink?: (assetId: string) => void;
  dragOverAssetId?: string | null;
  onAssetDragOver?: (assetId: string, e: React.DragEvent) => void;
  onAssetDragLeave?: (assetId: string, e: React.DragEvent) => void;
  onAssetDrop?: (assetId: string, e: React.DragEvent) => void;
}

export const AssetGrid = React.memo(function AssetGrid({
  assets,
  projectId,
  onAssetDeleted,
  onVersionUploaded,
  onCopied,
  onDuplicated,
  selectedIds,
  onToggleSelect,
  onAssetDragStart,
  onRequestMove,
  onCreateReviewLink,
  dragOverAssetId,
  onAssetDragOver,
  onAssetDragLeave,
  onAssetDrop,
}: AssetGridProps) {
  const router = useRouter();

  if (assets.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-semibold text-frame-textMuted uppercase tracking-wider mb-3">
        Assets ({assets.length})
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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
            isDropTarget={dragOverAssetId === asset.id}
            onDragOver={onAssetDragOver ? (e) => onAssetDragOver(asset.id, e) : undefined}
            onDragLeave={onAssetDragLeave ? (e) => onAssetDragLeave(asset.id, e) : undefined}
            onDrop={onAssetDrop ? (e) => onAssetDrop(asset.id, e) : undefined}
          />
        ))}
      </div>
    </div>
  );
});
