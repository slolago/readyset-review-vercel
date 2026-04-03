'use client';

import Image from 'next/image';
import { useRef, useState, useEffect } from 'react';
import { Play, Image as ImageIcon, Film, MoreHorizontal, Trash2, Clock, Upload, Layers } from 'lucide-react';
import { formatDuration, formatBytes } from '@/lib/utils';
import type { Asset } from '@/types';
import { Dropdown } from '@/components/ui/Dropdown';
import { useAuth } from '@/hooks/useAuth';
import { useUpload } from '@/hooks/useAssets';
import toast from 'react-hot-toast';

interface AssetCardProps {
  asset: Asset;
  onClick?: () => void;
  onDeleted?: () => void;
  onVersionUploaded?: () => void;
}

export function AssetCard({ asset, onClick, onDeleted, onVersionUploaded }: AssetCardProps) {
  const { getIdToken } = useAuth();
  const { uploadFile } = useUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const versionCount = (asset as any)._versionCount || 1;
  const signedUrl = (asset as any).signedUrl as string | undefined;
  const [videoThumb, setVideoThumb] = useState<string | null>(null);

  // Extract a video frame via canvas for the thumbnail
  useEffect(() => {
    if (asset.type !== 'video' || !signedUrl) return;
    let cancelled = false;

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;
    video.src = signedUrl;

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(2, video.duration * 0.1);
    };

    video.onseeked = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          setVideoThumb(canvas.toDataURL('image/jpeg', 0.75));
        }
      } catch {
        // CORS taint or other error — leave thumb as null
      }
      video.src = '';
    };

    video.onerror = () => {
      // leave thumb as null, fallback icon shown
    };

    return () => {
      cancelled = true;
      video.src = '';
    };
  }, [asset.type, signedUrl]);

  const handleUploadVersion = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const assetId = await uploadFile(file, asset.projectId, asset.folderId, asset.id);
    if (assetId) {
      toast.success('New version uploaded');
      onVersionUploaded?.();
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this asset?')) return;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success('Asset deleted');
        onDeleted?.();
      }
    } catch {
      toast.error('Failed to delete');
    }
  };

  const isUploading = asset.status === 'uploading';

  return (
    <>
      <input ref={fileInputRef} type="file" accept="video/*,image/*" className="hidden" onChange={handleFileSelected} />
    <div
      onClick={isUploading ? undefined : onClick}
      className={`group bg-frame-card border border-frame-border rounded-xl overflow-hidden transition-all ${
        isUploading ? 'opacity-60' : 'hover:border-frame-borderLight hover:bg-frame-cardHover cursor-pointer'
      }`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-black overflow-hidden">
        {asset.type === 'image' && signedUrl ? (
          <Image
            src={signedUrl}
            alt={asset.name}
            fill
            className="object-cover"
            unoptimized
          />
        ) : asset.type === 'video' && videoThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={videoThumb}
            alt={asset.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-frame-bg">
            {asset.type === 'video' ? (
              <Film className="w-10 h-10 text-frame-textMuted" />
            ) : (
              <ImageIcon className="w-10 h-10 text-frame-textMuted" />
            )}
          </div>
        )}

        {/* Play button overlay for videos */}
        {asset.type === 'video' && !isUploading && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/30">
              <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
            </div>
          </div>
        )}

        {/* Type badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1">
          <div className="px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-xs text-white flex items-center gap-1">
            {asset.type === 'video' ? (
              <Film className="w-3 h-3" />
            ) : (
              <ImageIcon className="w-3 h-3" />
            )}
            {asset.type}
          </div>
          <div className={`px-1.5 py-0.5 backdrop-blur-sm rounded text-xs text-white flex items-center gap-1 font-medium ${
            versionCount > 1 ? 'bg-frame-accent/80' : 'bg-black/60'
          }`}>
            <Layers className="w-3 h-3" />
            V{versionCount}
          </div>
        </div>

        {/* Duration for videos */}
        {asset.type === 'video' && asset.duration && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-xs text-white flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDuration(asset.duration)}
          </div>
        )}

        {/* Uploading overlay */}
        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-center">
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-1" />
              <p className="text-white text-xs">Uploading...</p>
            </div>
          </div>
        )}

        {/* Actions */}
        {!isUploading && (
          <div
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <Dropdown
              trigger={
                <button className="w-7 h-7 bg-black/60 backdrop-blur-sm rounded-lg flex items-center justify-center text-white hover:bg-black/80 transition-colors">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              }
              items={[
                {
                  label: 'Upload new version',
                  icon: <Upload className="w-4 h-4" />,
                  onClick: handleUploadVersion,
                },
                {
                  label: 'Delete',
                  icon: <Trash2 className="w-4 h-4" />,
                  onClick: handleDelete,
                  danger: true,
                },
              ]}
            />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-sm font-medium text-white truncate" title={asset.name}>
          {asset.name}
        </p>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-frame-textMuted">{formatBytes(asset.size)}</p>
          {versionCount > 1 && (
            <p className="text-xs text-frame-accent font-medium">{versionCount} versions</p>
          )}
        </div>

      </div>
    </div>
    </>
  );
}
