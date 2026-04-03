'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, CheckCircle, AlertCircle } from 'lucide-react';
import { cn, formatBytes } from '@/lib/utils';
import { useUpload } from '@/hooks/useAssets';
import type { UploadItem } from '@/types';

interface UploadZoneProps {
  projectId: string;
  folderId: string | null;
  onUploadComplete?: () => void;
}

export function UploadZone({ projectId, folderId, onUploadComplete }: UploadZoneProps) {
  const { uploads, uploadFile, clearCompleted } = useUpload();
  const [isDragOver, setIsDragOver] = useState(false);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setIsDragOver(false);
      const results = await Promise.all(
        acceptedFiles.map((file) => uploadFile(file, projectId, folderId))
      );
      // Only call onUploadComplete if at least one upload succeeded
      if (results.some((r) => r !== null)) {
        onUploadComplete?.();
      }
    },
    [projectId, folderId, uploadFile, onUploadComplete]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDragEnter: () => setIsDragOver(true),
    onDragLeave: () => setIsDragOver(false),
    accept: {
      'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'],
      'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
    },
    multiple: true,
  });

  const activeUploads = uploads.filter((u) => u.status === 'uploading' || u.status === 'pending');
  const hasUploads = uploads.length > 0;

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
          isDragActive || isDragOver
            ? 'border-frame-accent bg-frame-accent/5'
            : 'border-frame-border hover:border-frame-borderLight hover:bg-frame-cardHover'
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          <div
            className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center',
              isDragActive || isDragOver
                ? 'bg-frame-accent/20 text-frame-accent'
                : 'bg-frame-card text-frame-textMuted'
            )}
          >
            <Upload className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">
              {isDragActive ? 'Drop files here' : 'Upload files'}
            </p>
            <p className="text-xs text-frame-textMuted mt-1">
              Drag &amp; drop or click — MP4, MOV, JPG, PNG and more
            </p>
          </div>
        </div>
      </div>

      {/* Upload queue */}
      {hasUploads && (
        <div className="bg-frame-card border border-frame-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-frame-border">
            <p className="text-xs font-semibold text-frame-textSecondary uppercase tracking-wider">
              Uploads ({uploads.length})
            </p>
            {activeUploads.length === 0 && (
              <button
                onClick={clearCompleted}
                className="text-xs text-frame-textMuted hover:text-white transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="divide-y divide-frame-border max-h-48 overflow-y-auto">
            {uploads.map((upload) => (
              <UploadItem key={upload.id} item={upload} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UploadItem({ item }: { item: UploadItem }) {
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{item.file.name}</p>
        <p className="text-xs text-frame-textMuted mt-0.5">{formatBytes(item.file.size)}</p>
        {item.status === 'uploading' && (
          <div className="mt-2 bg-frame-bg rounded-full h-1.5">
            <div
              className="bg-frame-accent h-1.5 rounded-full upload-progress-bar"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        )}
        {item.status === 'error' && (
          <p className="text-xs text-red-400 mt-0.5">{item.error}</p>
        )}
      </div>

      <div className="flex-shrink-0">
        {item.status === 'uploading' && (
          <span className="text-xs text-frame-textSecondary">{item.progress}%</span>
        )}
        {item.status === 'complete' && (
          <CheckCircle className="w-5 h-5 text-frame-green" />
        )}
        {item.status === 'error' && (
          <AlertCircle className="w-5 h-5 text-red-400" />
        )}
      </div>
    </div>
  );
}
