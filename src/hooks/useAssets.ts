'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import type { Asset, UploadItem } from '@/types';
import { generateId } from '@/lib/utils';

function captureThumbnail(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    let settled = false;
    const done = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      video.src = '';
      URL.revokeObjectURL(url);
      resolve(blob);
    };

    const capture = () => {
      try {
        const canvas = document.createElement('canvas');
        const w = Math.min(video.videoWidth || 640, 640);
        const h = Math.round(w * ((video.videoHeight || 360) / (video.videoWidth || 640)));
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          canvas.toBlob((blob) => done(blob), 'image/jpeg', 0.8);
        } else {
          done(null);
        }
      } catch {
        done(null);
      }
    };

    // Add ALL listeners before setting src — blob URLs can fire events synchronously
    video.addEventListener('seeked', capture, { once: true });
    video.addEventListener('loadedmetadata', () => {
      // Seek to 25% of duration or 5s, whichever is smaller — avoids black intro frames
      video.currentTime = Math.min(video.duration * 0.25, 5) || 1;
    }, { once: true });
    video.addEventListener('error', () => done(null), { once: true });
    setTimeout(() => done(null), 5000);

    // Set src last so events don't fire before listeners are attached
    video.src = url;
  });
}

function extractVideoMetadata(file: File): Promise<{ width: number; height: number; duration: number; frameRate?: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'metadata';
    let settled = false;
    const done = (result: { width: number; height: number; duration: number; frameRate?: number } | null) => {
      if (settled) return;
      settled = true;
      video.pause();
      video.src = '';
      URL.revokeObjectURL(url);
      resolve(result);
    };

    video.addEventListener('loadedmetadata', () => {
      const base = { width: video.videoWidth, height: video.videoHeight, duration: video.duration };

      // Measure frameRate by counting decoded frames over ~1 second using requestVideoFrameCallback
      if (!('requestVideoFrameCallback' in video)) {
        done(base);
        return;
      }

      let frameCount = 0;
      let startMediaTime: number | null = null;

      const onFrame = (_now: DOMHighResTimeStamp, metadata: { mediaTime: number }) => {
        if (startMediaTime === null) startMediaTime = metadata.mediaTime;
        frameCount++;
        const elapsed = metadata.mediaTime - startMediaTime;
        if (elapsed >= 1.0 || frameCount >= 120) {
          const fps = elapsed > 0 ? Math.round(frameCount / elapsed) : undefined;
          done({ ...base, frameRate: fps });
          return;
        }
        (video as any).requestVideoFrameCallback(onFrame);
      };

      (video as any).requestVideoFrameCallback(onFrame);
      video.currentTime = 0;
      video.play().catch(() => done(base));
    }, { once: true });

    video.addEventListener('error', () => done(null), { once: true });
    setTimeout(() => done(null), 8000);
    video.src = url;
  });
}

export function useAssets(projectId?: string, folderId?: string | null) {
  const { getIdToken } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAssets = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getIdToken();
      const params = new URLSearchParams({ projectId });
      if (folderId !== undefined && folderId !== null) {
        params.set('folderId', folderId);
      }
      const res = await fetch(`/api/assets?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch assets');
      const data = await res.json();
      setAssets(data.assets);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [projectId, folderId, getIdToken]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  return { assets, loading, error, refetch: fetchAssets };
}

export function useAsset(assetId?: string) {
  const { getIdToken } = useAuth();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [versions, setVersions] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAsset = useCallback(async () => {
    if (!assetId) return;
    setLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/assets/${assetId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAsset(data.asset);
        setVersions(data.versions || []);
      }
    } catch (err) {
      console.error('Failed to fetch asset:', err);
    } finally {
      setLoading(false);
    }
  }, [assetId, getIdToken]);

  useEffect(() => {
    fetchAsset();
  }, [fetchAsset]);

  return { asset, versions, loading, refetch: fetchAsset };
}

export function useUpload() {
  const { getIdToken } = useAuth();
  const [uploads, setUploads] = useState<UploadItem[]>([]);

  const updateUpload = (id: string, updates: Partial<UploadItem>) => {
    setUploads((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...updates } : u))
    );
  };

  const uploadFile = async (
    file: File,
    projectId: string,
    folderId: string | null,
    parentAssetId?: string
  ): Promise<string | null> => {
    const uploadId = generateId();
    const newUpload: UploadItem = {
      id: uploadId,
      file,
      progress: 0,
      status: 'pending',
    };
    setUploads((prev) => [...prev, newUpload]);

    try {
      updateUpload(uploadId, { status: 'uploading' });
      const token = await getIdToken();

      // Step 1: Get signed URL
      const signedRes = await fetch('/api/upload/signed-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size,
          projectId,
          folderId,
          ...(parentAssetId ? { parentAssetId } : {}),
        }),
      });

      if (!signedRes.ok) throw new Error('Failed to get signed URL');
      const { signedUrl, assetId } = await signedRes.json();
      updateUpload(uploadId, { assetId });

      // Step 1b: Capture thumbnail + extract metadata for videos
      let videoMeta: { width: number; height: number; duration: number; frameRate?: number } | null = null;
      if (file.type.startsWith('video/')) {
        // Run thumbnail capture and metadata extraction in parallel
        const [thumbBlob, meta] = await Promise.all([
          captureThumbnail(file).catch(() => null),
          extractVideoMetadata(file).catch(() => null),
        ]);
        videoMeta = meta;

        if (thumbBlob) {
          try {
            const thumbForm = new FormData();
            thumbForm.append('assetId', assetId);
            thumbForm.append('thumbnail', thumbBlob, 'thumbnail.jpg');
            const thumbRes = await fetch('/api/upload/thumbnail', {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
              body: thumbForm,
            });
            if (!thumbRes.ok) {
              console.warn('[thumbnail] server upload failed:', thumbRes.status, thumbRes.statusText);
            }
          } catch (thumbErr) {
            console.warn('[thumbnail] capture/upload error (non-fatal):', thumbErr);
          }
        } else {
          console.warn('[thumbnail] captureThumbnail returned null — no thumbnail will be stored');
        }
      }

      // Step 2: Upload to GCS
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            updateUpload(uploadId, { progress });
          }
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            console.error(`[upload] GCS upload failed for "${file.name}":`, xhr.status, xhr.responseText);
            reject(new Error(`GCS upload failed (${xhr.status}): ${xhr.responseText || 'No response'}`));
          }
        });
        xhr.addEventListener('error', (e) => {
          console.error(`[upload] GCS network error for "${file.name}":`, e);
          reject(new Error('Network error — check CORS config on GCS bucket'));
        });
        xhr.open('PUT', signedUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

      // Step 3: Mark complete
      const completeRes = await fetch('/api/upload/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          assetId,
          ...(videoMeta ? {
            width: videoMeta.width,
            height: videoMeta.height,
            duration: videoMeta.duration,
            ...(videoMeta.frameRate !== undefined ? { frameRate: videoMeta.frameRate } : {}),
          } : {}),
        }),
      });

      if (!completeRes.ok) throw new Error('Failed to complete upload');
      updateUpload(uploadId, { status: 'complete', progress: 100 });
      return assetId;
    } catch (err) {
      updateUpload(uploadId, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Upload failed',
      });
      return null;
    }
  };

  const clearCompleted = () => {
    setUploads((prev) => prev.filter((u) => u.status === 'uploading' || u.status === 'pending'));
  };

  return { uploads, uploadFile, clearCompleted };
}
