'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useProject } from '@/hooks/useProject';
import { useAssets, useUpload } from '@/hooks/useAssets';
import { AssetGrid } from './AssetGrid';
import { CreateFolderModal } from './CreateFolderModal';
import { CollaboratorsPanel } from '@/components/projects/CollaboratorsPanel';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import {
  Plus,
  Upload,
  Users,
  ChevronRight,
  Home,
  Folder,
  MoreHorizontal,
  Trash2,
  Link as LinkIcon,
  CheckCircle,
  AlertCircle,
  FolderOpen,
} from 'lucide-react';
import type { Folder as FolderType, UploadItem } from '@/types';
import { getProjectColor, formatBytes } from '@/lib/utils';
import { Dropdown } from '@/components/ui/Dropdown';
import toast from 'react-hot-toast';
import { CreateReviewLinkModal } from '@/components/review/CreateReviewLinkModal';

interface FolderBrowserProps {
  projectId: string;
  folderId: string | null;
}

export function FolderBrowser({ projectId, folderId }: FolderBrowserProps) {
  const { user, getIdToken } = useAuth();
  const router = useRouter();
  const { project, loading: projectLoading, refetch: refetchProject } = useProject(projectId);
  const { assets, loading: assetsLoading, refetch: refetchAssets } = useAssets(projectId, folderId);
  const { uploads, uploadFile, clearCompleted } = useUpload();
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [currentFolder, setCurrentFolder] = useState<FolderType | null>(null);
  const [ancestorFolders, setAncestorFolders] = useState<FolderType[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string | null; name: string }>>([]);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Folder API helpers ──────────────────────────────────────────────────
  const fetchFolders = useCallback(async () => {
    try {
      const token = await getIdToken();
      const params = new URLSearchParams({ projectId });
      if (folderId) params.set('parentId', folderId);
      const res = await fetch(`/api/folders?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFolders(data.folders);
      }
    } catch (err) {
      console.error('Failed to fetch folders:', err);
    }
  }, [projectId, folderId, getIdToken]);

  const fetchCurrentFolder = useCallback(async () => {
    if (!folderId) {
      setCurrentFolder(null);
      setAncestorFolders([]);
      return;
    }
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/folders/${folderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentFolder(data.folder);
        setAncestorFolders(data.ancestors || []);
      }
    } catch (err) {
      console.error('Failed to fetch folder:', err);
    }
  }, [folderId, getIdToken]);

  useEffect(() => {
    fetchFolders();
    fetchCurrentFolder();
  }, [fetchFolders, fetchCurrentFolder]);

  useEffect(() => {
    const crumbs: Array<{ id: string | null; name: string }> = [
      { id: null, name: project?.name || 'Project' },
    ];
    for (const ancestor of ancestorFolders) {
      crumbs.push({ id: ancestor.id, name: ancestor.name });
    }
    if (currentFolder) {
      crumbs.push({ id: currentFolder.id, name: currentFolder.name });
    }
    setBreadcrumbs(crumbs);
  }, [project, currentFolder, ancestorFolders]);

  // ── Folder drag & drop (preserves tree structure) ───────────────────────
  const createFolderInApi = async (name: string, parentFolderId: string | null): Promise<string | null> => {
    try {
      const token = await getIdToken();
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, projectId, parentId: parentFolderId }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.folder?.id ?? null;
    } catch {
      return null;
    }
  };

  const readAllDirEntries = (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> =>
    new Promise((resolve, reject) => {
      const all: FileSystemEntry[] = [];
      const read = () =>
        reader.readEntries((batch) => {
          if (!batch.length) return resolve(all);
          all.push(...batch);
          read(); // Chrome returns max 100 per call — keep reading
        }, reject);
      read();
    });

  const processEntry = async (entry: FileSystemEntry, parentFolderId: string | null): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) =>
        (entry as FileSystemFileEntry).file(res, rej)
      );
      if (file.type.startsWith('video/') || file.type.startsWith('image/')) {
        await uploadFile(file, projectId, parentFolderId);
      }
    } else if (entry.isDirectory) {
      const newFolderId = await createFolderInApi(entry.name, parentFolderId);
      if (!newFolderId) return;
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const children = await readAllDirEntries(reader);
      await Promise.all(children.map((child) => processEntry(child, newFolderId)));
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragActive(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragActive(false);

    const items = Array.from(e.dataTransfer.items);
    const entries = items
      .map((item) => (item as any).webkitGetAsEntry() as FileSystemEntry | null)
      .filter((entry): entry is FileSystemEntry => entry !== null);

    if (!entries.length) return;

    const hasDirectory = entries.some((entry) => entry.isDirectory);

    if (hasDirectory) {
      // Process full folder tree
      await Promise.all(entries.map((entry) => processEntry(entry, folderId)));
      fetchFolders();
      refetchAssets();
    } else {
      // Plain files only
      const files = items
        .map((item) => item.getAsFile())
        .filter((f): f is File => f !== null)
        .filter((f) => f.type.startsWith('video/') || f.type.startsWith('image/'));
      if (files.length) {
        const results = await Promise.all(files.map((f) => uploadFile(f, projectId, folderId)));
        if (results.some((r) => r !== null)) refetchAssets();
      }
    }
  };

  // ── Other handlers ───────────────────────────────────────────────────────
  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      if (!files.length) return;
      const results = await Promise.all(files.map((f) => uploadFile(f, projectId, folderId)));
      if (results.some((r) => r !== null)) refetchAssets();
    },
    [projectId, folderId, uploadFile, refetchAssets]
  );

  const handleDeleteFolder = async (deleteFolderId: string) => {
    if (!confirm('Delete this folder?')) return;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/folders/${deleteFolderId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success('Folder deleted');
        fetchFolders();
      }
    } catch {
      toast.error('Failed to delete folder');
    }
  };

  if (projectLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Spinner size="lg" />
      </div>
    );
  }

  const color = project ? getProjectColor(project.color) : '#6c5ce7';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 py-4 border-b border-frame-border flex items-center justify-between bg-frame-sidebar">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-sm overflow-x-auto">
          {breadcrumbs.map((crumb, i) => {
            const isLast = i === breadcrumbs.length - 1;
            const isRoot = i === 0;
            const href = crumb.id
              ? `/projects/${projectId}/folders/${crumb.id}`
              : `/projects/${projectId}`;

            return (
              <span key={crumb.id ?? 'root'} className="flex items-center gap-1 flex-shrink-0">
                {i > 0 && <ChevronRight className="w-4 h-4 text-frame-textMuted" />}
                {isLast ? (
                  <span className="flex items-center gap-1.5 text-white font-medium">
                    {isRoot && (
                      <div
                        className="w-5 h-5 rounded flex items-center justify-center"
                        style={{ backgroundColor: color + '20', color }}
                      >
                        <Home className="w-3 h-3" />
                      </div>
                    )}
                    {crumb.name}
                  </span>
                ) : (
                  <Link
                    href={href}
                    className="flex items-center gap-1.5 text-frame-textSecondary hover:text-white transition-colors"
                  >
                    {isRoot && (
                      <div
                        className="w-5 h-5 rounded flex items-center justify-center"
                        style={{ backgroundColor: color + '20', color }}
                      >
                        <Home className="w-3 h-3" />
                      </div>
                    )}
                    {crumb.name}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCollaborators(true)}
            icon={<Users className="w-4 h-4" />}
          >
            Team
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowReviewModal(true)}
            icon={<LinkIcon className="w-4 h-4" />}
          >
            Share
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowCreateFolder(true)}
            icon={<Plus className="w-4 h-4" />}
          >
            Folder
          </Button>
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            icon={<Upload className="w-4 h-4" />}
          >
            Upload
          </Button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept="video/*,image/*"
        onChange={handleFileInputChange}
      />

      {/* Content — full drop zone */}
      <div
        className="flex-1 overflow-y-auto p-8 space-y-6 relative outline-none"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragActive && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-frame-accent/10 border-2 border-dashed border-frame-accent rounded-xl m-2 pointer-events-none">
            <div className="text-center">
              <FolderOpen className="w-12 h-12 text-frame-accent mx-auto mb-3" />
              <p className="text-frame-accent font-semibold text-lg">Drop files or folders</p>
              <p className="text-frame-accent/70 text-sm mt-1">Folder structure will be preserved</p>
            </div>
          </div>
        )}

        {/* Folders */}
        {folders.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-frame-textMuted uppercase tracking-wider mb-3">
              Folders ({folders.length})
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {folders.map((folder) => (
                <FolderCard
                  key={folder.id}
                  folder={folder}
                  projectId={projectId}
                  onDelete={() => handleDeleteFolder(folder.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Assets */}
        {assetsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <AssetGrid
            assets={assets}
            projectId={projectId}
            onAssetDeleted={refetchAssets}
            onVersionUploaded={refetchAssets}
          />
        )}

        {/* Empty state */}
        {!assetsLoading && assets.length === 0 && folders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-frame-card border border-frame-border rounded-2xl flex items-center justify-center mb-4">
              <Upload className="w-8 h-8 text-frame-textMuted" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">No files yet</h3>
            <p className="text-frame-textSecondary text-sm max-w-xs mb-6">
              Drag files or folders here, or click Upload to get started.
            </p>
            <Button
              onClick={() => fileInputRef.current?.click()}
              icon={<Upload className="w-4 h-4" />}
            >
              Upload files
            </Button>
          </div>
        )}
      </div>

      {/* Floating upload progress panel */}
      {uploads.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 w-72 bg-frame-card border border-frame-border rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-frame-border">
            <p className="text-xs font-semibold text-frame-textSecondary uppercase tracking-wider">
              Uploads ({uploads.length})
            </p>
            <button
              onClick={clearCompleted}
              className="text-xs text-frame-textMuted hover:text-white transition-colors"
            >
              Dismiss
            </button>
          </div>
          <div className="divide-y divide-frame-border max-h-52 overflow-y-auto">
            {uploads.map((upload) => (
              <UploadProgressItem key={upload.id} item={upload} />
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreateFolder && (
        <CreateFolderModal
          projectId={projectId}
          parentId={folderId}
          onClose={() => setShowCreateFolder(false)}
          onCreated={() => {
            fetchFolders();
            setShowCreateFolder(false);
          }}
        />
      )}

      {showCollaborators && project && (
        <CollaboratorsPanel
          project={project}
          onClose={() => setShowCollaborators(false)}
          onUpdated={() => {
            refetchProject();
            setShowCollaborators(false);
          }}
        />
      )}

      {showReviewModal && (
        <CreateReviewLinkModal
          projectId={projectId}
          folderId={folderId}
          onClose={() => setShowReviewModal(false)}
        />
      )}
    </div>
  );
}

function FolderCard({
  folder,
  projectId,
  onDelete,
}: {
  folder: FolderType;
  projectId: string;
  onDelete: () => void;
}) {
  const router = useRouter();

  return (
    <div
      className="group bg-frame-card border border-frame-border hover:border-frame-borderLight rounded-xl p-3 cursor-pointer transition-all hover:bg-frame-cardHover"
      onClick={() => router.push(`/projects/${projectId}/folders/${folder.id}`)}
    >
      <div className="flex items-start justify-between mb-2">
        <Folder className="w-8 h-8 text-frame-accent" />
        <div
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <Dropdown
            trigger={
              <button className="w-6 h-6 flex items-center justify-center rounded text-frame-textMuted hover:text-white hover:bg-frame-border transition-colors">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            }
            items={[
              {
                label: 'Delete',
                icon: <Trash2 className="w-4 h-4" />,
                onClick: onDelete,
                danger: true,
              },
            ]}
          />
        </div>
      </div>
      <p className="text-sm font-medium text-white truncate">{folder.name}</p>
    </div>
  );
}

function UploadProgressItem({ item }: { item: UploadItem }) {
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{item.file.name}</p>
        <p className="text-xs text-frame-textMuted">{formatBytes(item.file.size)}</p>
        {item.status === 'uploading' && (
          <div className="mt-1.5 bg-frame-bg rounded-full h-1">
            <div
              className="bg-frame-accent h-1 rounded-full transition-all"
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
          <span className="text-xs text-frame-textSecondary tabular-nums">{item.progress}%</span>
        )}
        {item.status === 'complete' && <CheckCircle className="w-4 h-4 text-frame-green" />}
        {item.status === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
      </div>
    </div>
  );
}
