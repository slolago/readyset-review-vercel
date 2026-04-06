'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useProject } from '@/hooks/useProject';
import { useAssets, useUpload } from '@/hooks/useAssets';
import { AssetGrid } from './AssetGrid';
import { CreateFolderModal } from './CreateFolderModal';
import { CollaboratorsPanel } from '@/components/projects/CollaboratorsPanel';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import {
  Plus,
  Upload,
  Users,
  Home,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Trash2,
  Link as LinkIcon,
  CheckCircle,
  AlertCircle,
  Check,
  Move,
  X,
  Pencil,
  Copy,
  CopyPlus,
} from 'lucide-react';
import type { Folder as FolderType, UploadItem } from '@/types';
import { getProjectColor, formatBytes } from '@/lib/utils';
import { Dropdown } from '@/components/ui/Dropdown';
import toast from 'react-hot-toast';
import { CreateReviewLinkModal } from '@/components/review/CreateReviewLinkModal';

interface FolderBrowserProps {
  projectId: string;
  folderId: string | null;
  ancestorPath?: string; // comma-separated ancestor folder IDs from URL, used when Firestore parentId chain is missing
}

export function FolderBrowser({ projectId, folderId, ancestorPath = '' }: FolderBrowserProps) {
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
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [allFolders, setAllFolders] = useState<FolderType[]>([]);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rubberBand, setRubberBand] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const rubberBandRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // Drag-to-drop state (file/folder upload from OS)
  const [isDragActive, setIsDragActive] = useState(false);
  const dropDragCounter = useRef(0);

  // Drag-to-move state (move selected items by dropping onto a folder card)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // ── Folder fetching ──────────────────────────────────────────────────────
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

        if (data.ancestors?.length > 0) {
          setAncestorFolders(data.ancestors);
        } else if (ancestorPath) {
          // Firestore parentId chain may be missing — fall back to URL-encoded path
          const ids = ancestorPath.split(',').filter(Boolean);
          const fetched = await Promise.all(
            ids.map(async (id) => {
              const r = await fetch(`/api/folders/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!r.ok) return null;
              const d = await r.json();
              return d.folder ?? null;
            })
          );
          setAncestorFolders(fetched.filter(Boolean) as FolderType[]);
        } else {
          setAncestorFolders([]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch folder:', err);
    }
  }, [folderId, ancestorPath, getIdToken]);

  useEffect(() => {
    fetchFolders();
    fetchCurrentFolder();
  }, [fetchFolders, fetchCurrentFolder]);

  // Breadcrumbs
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

  // Path string for child folder navigation (ancestor IDs + current folder ID)
  const childAncestorPath = [
    ...( ancestorPath ? ancestorPath.split(',').filter(Boolean) : []),
    ...(folderId ? [folderId] : []),
  ].join(',');

  // ── Multi-select: rubber band ────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (!isDraggingRef.current && Math.hypot(dx, dy) > 5) isDraggingRef.current = true;
      if (isDraggingRef.current) {
        const band = {
          x1: dragStartRef.current.x,
          y1: dragStartRef.current.y,
          x2: e.clientX,
          y2: e.clientY,
        };
        rubberBandRef.current = band;
        setRubberBand({ ...band });
      }
    };

    const onUp = () => {
      if (isDraggingRef.current && rubberBandRef.current) {
        const { x1, y1, x2, y2 } = rubberBandRef.current;
        const bx1 = Math.min(x1, x2);
        const bx2 = Math.max(x1, x2);
        const by1 = Math.min(y1, y2);
        const by2 = Math.max(y1, y2);
        const newSel = new Set<string>();
        document.querySelectorAll<HTMLElement>('[data-selectable]').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.left < bx2 && r.right > bx1 && r.top < by2 && r.bottom > by1) {
            newSel.add(el.dataset.selectable!);
          }
        });
        if (newSel.size > 0) setSelectedIds(newSel);
      }
      dragStartRef.current = null;
      isDraggingRef.current = false;
      rubberBandRef.current = null;
      setRubberBand(null);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  const handleContentMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Allow native HTML5 drag to start on draggable items before doing anything else
    if ((e.target as HTMLElement).closest('[data-selectable]')) return;
    e.preventDefault(); // prevent browser text selection on rubber-band drag
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) setSelectedIds(new Set());
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = false;
  };

  const toggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleItemDragStart = useCallback((itemId: string, e: React.DragEvent) => {
    // Carry all selected IDs when dragging a selected item; otherwise just this item
    const ids = selectedIds.has(itemId) ? Array.from(selectedIds) : [itemId];
    e.dataTransfer.setData('application/x-frame-move', JSON.stringify({ ids }));
    e.dataTransfer.effectAllowed = 'move';
  }, [selectedIds]);

  // ── Batch actions ────────────────────────────────────────────────────────
  const handleDeleteSelected = async () => {
    if (!confirm(`Delete ${selectedIds.size} item(s)?`)) return;
    try {
      const token = await getIdToken();
      const ids = Array.from(selectedIds);
      const assetIds = ids.filter((id) => assets.some((a) => a.id === id));
      const folderIds = ids.filter((id) => folders.some((f) => f.id === id));

      await Promise.all([
        ...assetIds.map((id) =>
          fetch(`/api/assets/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
        ),
        ...folderIds.map((id) =>
          fetch(`/api/folders/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
        ),
      ]);

      toast.success(`Deleted ${selectedIds.size} item(s)`);
      setSelectedIds(new Set());
      refetchAssets();
      fetchFolders();
    } catch {
      toast.error('Failed to delete items');
    }
  };

  const handleOpenMoveModal = async () => {
    const token = await getIdToken();
    const res = await fetch(`/api/folders?projectId=${projectId}&all=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setAllFolders(data.folders);
    }
    setShowMoveModal(true);
  };

  const ensureAllFolders = async () => {
    if (allFolders.length > 0) return; // already loaded
    const token = await getIdToken();
    const res = await fetch(`/api/folders?projectId=${projectId}&all=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setAllFolders(data.folders);
    }
  };

  const handleMoveSelected = async (targetFolderId: string | null) => {
    try {
      const token = await getIdToken();
      const ids = Array.from(selectedIds);
      const assetIds = ids.filter((id) => assets.some((a) => a.id === id));
      const folderIds = ids.filter((id) => folders.some((f) => f.id === id));

      await Promise.all([
        ...assetIds.map((id) =>
          fetch(`/api/assets/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ folderId: targetFolderId }),
          })
        ),
        ...folderIds.map((id) =>
          fetch(`/api/folders/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ parentId: targetFolderId }),
          })
        ),
      ]);

      toast.success(`Moved ${selectedIds.size} item(s)`);
      setSelectedIds(new Set());
      setShowMoveModal(false);
      refetchAssets();
      fetchFolders();
    } catch {
      toast.error('Failed to move items');
    }
  };

  // ── File/folder drag-and-drop upload ────────────────────────────────────
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
          read();
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
    // Don't activate OS-drop overlay for internal item drags
    if (e.dataTransfer.types.includes('application/x-frame-move')) return;
    dropDragCounter.current++;
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('application/x-frame-move')) return;
    dropDragCounter.current--;
    if (dropDragCounter.current === 0) setIsDragActive(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dropDragCounter.current = 0;
    setIsDragActive(false);

    const items = Array.from(e.dataTransfer.items);
    const entries = items
      .map((item) => (item as any).webkitGetAsEntry() as FileSystemEntry | null)
      .filter((entry): entry is FileSystemEntry => entry !== null);

    if (!entries.length) return;

    const hasDirectory = entries.some((entry) => entry.isDirectory);
    if (hasDirectory) {
      await Promise.all(entries.map((entry) => processEntry(entry, folderId)));
      fetchFolders();
      refetchAssets();
    } else {
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

  const handleFolderInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    const token = await getIdToken();

    const makeFolderViaApi = async (name: string, parentId: string | null): Promise<string | null> => {
      try {
        const res = await fetch('/api/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name, projectId, parentId }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.folder?.id ?? null;
      } catch { return null; }
    };

    // Build a path→folderId map. Root ('') → current folderId.
    const folderMap = new Map<string, string | null>();
    folderMap.set('', folderId);

    // Collect unique directory paths and sort shallow-first
    const allDirs = new Set<string>();
    for (const file of files) {
      const parts = ((file as any).webkitRelativePath as string | undefined)?.split('/') || [file.name];
      for (let i = 1; i < parts.length - 1; i++) {
        allDirs.add(parts.slice(0, i + 1).join('/'));
      }
    }
    const sortedDirs = Array.from(allDirs).sort((a, b) => a.split('/').length - b.split('/').length);

    // Create folders in order
    for (const dirPath of sortedDirs) {
      const parts = dirPath.split('/');
      const name = parts[parts.length - 1];
      const parentPath = parts.slice(0, -1).join('/');
      const parentId = folderMap.get(parentPath) ?? folderId;
      const newId = await makeFolderViaApi(name, parentId);
      folderMap.set(dirPath, newId);
    }

    // Upload files into their respective folders
    const uploadPromises = files
      .filter((f) => f.type.startsWith('video/') || f.type.startsWith('image/'))
      .map((file) => {
        const parts = ((file as any).webkitRelativePath as string | undefined)?.split('/') || [file.name];
        const dirPath = parts.slice(0, -1).join('/');
        const targetFolderId = folderMap.get(dirPath) ?? folderId;
        return uploadFile(file, projectId, targetFolderId);
      });

    const results = await Promise.all(uploadPromises);
    fetchFolders();
    if (results.some((r) => r !== null)) refetchAssets();
  };

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

  // ── Drag-to-move: folder drop target handlers ────────────────────────────
  const handleFolderDragOver = useCallback((folderId: string, e: React.DragEvent) => {
    // Only accept our custom move payload
    if (!e.dataTransfer.types.includes('application/x-frame-move')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolderId(folderId);
  }, []);

  const handleFolderDragLeave = useCallback((_folderId: string, _e: React.DragEvent) => {
    setDragOverFolderId(null);
  }, []);

  const handleFolderDrop = useCallback(async (targetFolderId: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverFolderId(null);

    const raw = e.dataTransfer.getData('application/x-frame-move');
    if (!raw) return;

    let payload: { ids: string[] };
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    const { ids } = payload;
    if (!ids?.length) return;

    // Self-drop prevention: ignore if the target folder is in the dragged set
    if (ids.includes(targetFolderId)) return;

    // Reuse existing handleMoveSelected by temporarily setting selectedIds
    // Instead, call the move API directly to avoid coupling to selection state
    try {
      const token = await getIdToken();
      const assetIds = ids.filter((id) => assets.some((a) => a.id === id));
      const folderIds = ids.filter((id) => folders.some((f) => f.id === id));

      await Promise.all([
        ...assetIds.map((id) =>
          fetch(`/api/assets/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ folderId: targetFolderId }),
          })
        ),
        ...folderIds.map((id) =>
          fetch(`/api/folders/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ parentId: targetFolderId }),
          })
        ),
      ]);

      toast.success(`Moved ${ids.length} item(s)`);
      setSelectedIds(new Set());
      refetchAssets();
      fetchFolders();
    } catch {
      toast.error('Failed to move items');
    }
  }, [assets, folders, getIdToken, refetchAssets, fetchFolders]);

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
        <Breadcrumb items={breadcrumbs} projectId={projectId} projectColor={color} />

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setShowCollaborators(true)} icon={<Users className="w-4 h-4" />}>
            Team
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowReviewModal(true)} icon={<LinkIcon className="w-4 h-4" />}>
            Share
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowCreateFolder(true)} icon={<Plus className="w-4 h-4" />}>
            Folder
          </Button>
          <Button variant="secondary" size="sm" onClick={() => folderInputRef.current?.click()} icon={<FolderOpen className="w-4 h-4" />}>
            Folder
          </Button>
          <Button size="sm" onClick={() => fileInputRef.current?.click()} icon={<Upload className="w-4 h-4" />}>
            Files
          </Button>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" className="hidden" multiple accept="video/*,image/*" onChange={handleFileInputChange} />
      <input ref={folderInputRef} type="file" className="hidden" {...({ webkitdirectory: '' } as any)} onChange={handleFolderInputChange} />

      {/* Content */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto p-8 space-y-6 relative outline-none select-none"
        style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
        onMouseDown={handleContentMouseDown}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* File drop overlay */}
        {isDragActive && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-frame-accent/10 border-2 border-dashed border-frame-accent rounded-xl m-2 pointer-events-none">
            <div className="text-center">
              <FolderOpen className="w-12 h-12 text-frame-accent mx-auto mb-3" />
              <p className="text-frame-accent font-semibold text-lg">Drop files or folders</p>
              <p className="text-frame-accent/70 text-sm mt-1">Folder structure will be preserved</p>
            </div>
          </div>
        )}

        {/* Rubber band selection rect */}
        {rubberBand && (
          <div
            className="pointer-events-none fixed z-40 border border-frame-accent bg-frame-accent/10"
            style={{
              left: Math.min(rubberBand.x1, rubberBand.x2),
              top: Math.min(rubberBand.y1, rubberBand.y2),
              width: Math.abs(rubberBand.x2 - rubberBand.x1),
              height: Math.abs(rubberBand.y2 - rubberBand.y1),
            }}
          />
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
                  ancestorPath={childAncestorPath}
                  isSelected={selectedIds.has(folder.id)}
                  isDropTarget={dragOverFolderId === folder.id}
                  onToggleSelect={(e) => toggleSelect(folder.id, e)}
                  onDelete={() => handleDeleteFolder(folder.id)}
                  onRename={fetchFolders}
                  allFolders={allFolders}
                  onBeforeCopyTo={ensureAllFolders}
                  onCopyTo={async (targetParentId) => {
                    try {
                      const token = await getIdToken();
                      const res = await fetch('/api/folders/copy', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ folderId: folder.id, targetParentId }),
                      });
                      if (res.ok) {
                        toast.success('Folder copied');
                        fetchFolders();
                      } else {
                        toast.error('Copy failed');
                      }
                    } catch {
                      toast.error('Copy failed');
                    }
                  }}
                  onDuplicate={async () => {
                    try {
                      const token = await getIdToken();
                      const res = await fetch('/api/folders/copy', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ folderId: folder.id }),
                      });
                      if (res.ok) {
                        toast.success('Folder duplicated');
                        fetchFolders();
                      } else {
                        toast.error('Duplicate failed');
                      }
                    } catch {
                      toast.error('Duplicate failed');
                    }
                  }}
                  onDragStart={(e) => handleItemDragStart(folder.id, e)}
                  onDragOver={(e) => handleFolderDragOver(folder.id, e)}
                  onDragLeave={(e) => handleFolderDragLeave(folder.id, e)}
                  onDrop={(e) => handleFolderDrop(folder.id, e)}
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
            onCopied={refetchAssets}
            onDuplicated={refetchAssets}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onAssetDragStart={handleItemDragStart}
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
            <Button onClick={() => fileInputRef.current?.click()} icon={<Upload className="w-4 h-4" />}>
              Upload files
            </Button>
          </div>
        )}
      </div>

      {/* Multi-select action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 bg-frame-card border border-frame-border rounded-2xl shadow-2xl">
          <span className="text-sm text-white font-medium mr-1">{selectedIds.size} selected</span>
          <button
            onClick={handleOpenMoveModal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-frame-border hover:bg-frame-borderLight rounded-lg transition-colors"
          >
            <Move className="w-3.5 h-3.5" />
            Move
          </button>
          <button
            onClick={handleDeleteSelected}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-1 text-frame-textMuted hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Upload progress panel */}
      {uploads.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 w-72 bg-frame-card border border-frame-border rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-frame-border">
            <p className="text-xs font-semibold text-frame-textSecondary uppercase tracking-wider">
              Uploads ({uploads.length})
            </p>
            <button onClick={clearCompleted} className="text-xs text-frame-textMuted hover:text-white transition-colors">
              Clear completed
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
          onCreated={() => { fetchFolders(); setShowCreateFolder(false); }}
        />
      )}

      {showCollaborators && project && (
        <CollaboratorsPanel
          project={project}
          onClose={() => setShowCollaborators(false)}
          onUpdated={() => { refetchProject(); setShowCollaborators(false); }}
        />
      )}

      {showReviewModal && (
        <CreateReviewLinkModal
          projectId={projectId}
          folderId={folderId}
          onClose={() => setShowReviewModal(false)}
        />
      )}

      {showMoveModal && (
        <MoveModal
          folders={allFolders}
          currentFolderId={folderId}
          selectedCount={selectedIds.size}
          onMove={handleMoveSelected}
          onClose={() => setShowMoveModal(false)}
        />
      )}
    </div>
  );
}

// ── FolderCard ───────────────────────────────────────────────────────────────

function FolderCard({
  folder,
  projectId,
  ancestorPath,
  isSelected,
  isDropTarget,
  onToggleSelect,
  onDelete,
  onRename,
  allFolders,
  onBeforeCopyTo,
  onCopyTo,
  onDuplicate,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  folder: FolderType;
  projectId: string;
  ancestorPath?: string;
  isSelected?: boolean;
  isDropTarget?: boolean;
  onToggleSelect?: (e: React.MouseEvent) => void;
  onDelete: () => void;
  onRename?: () => void;
  allFolders?: FolderType[];
  onBeforeCopyTo?: () => Promise<void>;
  onCopyTo?: (targetParentId: string | null) => void;
  onDuplicate?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
  const router = useRouter();
  const { getIdToken } = useAuth();
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [showFolderCopyModal, setShowFolderCopyModal] = useState(false);

  const handleOpenCopyModal = async () => {
    await onBeforeCopyTo?.();
    setShowFolderCopyModal(true);
  };

  const handleRenameFolder = () => {
    setRenameValue(folder.name);
    setIsRenaming(true);
    setTimeout(() => renameInputRef.current?.select(), 0);
  };

  const commitFolderRename = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === folder.name) {
      setIsRenaming(false);
      return;
    }
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/folders/${folder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        toast.success('Renamed');
        onRename?.();
      } else {
        toast.error('Rename failed');
      }
    } catch {
      toast.error('Rename failed');
    } finally {
      setIsRenaming(false);
    }
  };

  return (
    <div
      data-selectable={folder.id}
      draggable
      onDragStart={onDragStart}
      className={`group relative bg-frame-card border rounded-xl p-3 cursor-pointer transition-all hover:bg-frame-cardHover ${
        isDropTarget
          ? 'border-frame-accent ring-2 ring-frame-accent bg-frame-accent/10'
          : isSelected
          ? 'border-frame-accent ring-1 ring-frame-accent'
          : 'border-frame-border hover:border-frame-borderLight'
      }`}
      onClick={() => {
        const url = `/projects/${projectId}/folders/${folder.id}${ancestorPath ? `?path=${ancestorPath}` : ''}`;
        router.push(url);
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Checkbox */}
      {onToggleSelect && (
        <div
          className={`absolute top-2 left-2 z-10 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          onClick={(e) => { e.stopPropagation(); onToggleSelect(e); }}
        >
          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
            isSelected ? 'bg-frame-accent border-frame-accent' : 'bg-black/60 border-white/60 backdrop-blur-sm'
          }`}>
            {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
          </div>
        </div>
      )}

      <div className="flex items-start justify-between mb-2 mt-1">
        <Folder className="w-8 h-8 text-frame-accent" />
        <div className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          <Dropdown
            trigger={
              <button className="w-6 h-6 flex items-center justify-center rounded text-frame-textMuted hover:text-white hover:bg-frame-border transition-colors">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            }
            items={[
              { label: 'Rename', icon: <Pencil className="w-4 h-4" />, onClick: handleRenameFolder },
              { label: 'Copy to', icon: <Copy className="w-4 h-4" />, onClick: handleOpenCopyModal },
              { label: 'Duplicate', icon: <CopyPlus className="w-4 h-4" />, onClick: onDuplicate ?? (() => {}) },
              { label: 'Delete', icon: <Trash2 className="w-4 h-4" />, onClick: onDelete, danger: true, divider: true },
            ]}
          />
        </div>
      </div>
      {isRenaming ? (
        <input
          ref={renameInputRef}
          className="w-full bg-frame-bg border border-frame-accent rounded px-1.5 py-0.5 text-sm font-medium text-white outline-none focus:ring-1 focus:ring-frame-accent"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitFolderRename(); }
            if (e.key === 'Escape') { setIsRenaming(false); }
          }}
          onBlur={commitFolderRename}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <p className="text-sm font-medium text-white truncate">{folder.name}</p>
      )}
      {showFolderCopyModal && (
        <MoveModal
          folders={allFolders ?? []}
          currentFolderId={null}
          selectedCount={0}
          title="Copy to folder"
          onMove={(targetParentId) => {
            onCopyTo?.(targetParentId);
            setShowFolderCopyModal(false);
          }}
          onClose={() => setShowFolderCopyModal(false)}
        />
      )}
    </div>
  );
}

// ── MoveModal ────────────────────────────────────────────────────────────────

function MoveModal({
  folders,
  currentFolderId,
  selectedCount,
  title,
  onMove,
  onClose,
}: {
  folders: FolderType[];
  currentFolderId: string | null;
  selectedCount: number;
  title?: string;
  onMove: (folderId: string | null) => void;
  onClose: () => void;
}) {
  // Build a simple indented list showing the folder hierarchy
  const buildTree = (parentId: string | null, depth: number): { folder: FolderType; depth: number }[] => {
    const children = folders.filter((f) => (f.parentId ?? null) === parentId);
    const result: { folder: FolderType; depth: number }[] = [];
    for (const child of children) {
      result.push({ folder: child, depth });
      result.push(...buildTree(child.id, depth + 1));
    }
    return result;
  };

  const tree = buildTree(null, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-frame-card border border-frame-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-frame-border">
          <h3 className="text-sm font-semibold text-white">{title ?? `Move ${selectedCount} item(s)`}</h3>
          <button onClick={onClose} className="text-frame-textMuted hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-72 overflow-y-auto py-2">
          {/* Root option */}
          <button
            onClick={() => onMove(null)}
            className="w-full flex items-center gap-2 px-5 py-2.5 text-sm text-frame-textSecondary hover:text-white hover:bg-frame-border/50 transition-colors text-left"
          >
            <Home className="w-4 h-4 flex-shrink-0" />
            <span>Project root</span>
          </button>

          {tree.map(({ folder, depth }) => (
            <button
              key={folder.id}
              onClick={() => onMove(folder.id)}
              disabled={folder.id === currentFolderId}
              className="w-full flex items-center gap-2 px-5 py-2.5 text-sm text-frame-textSecondary hover:text-white hover:bg-frame-border/50 transition-colors text-left disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ paddingLeft: `${20 + depth * 16}px` }}
            >
              <Folder className="w-4 h-4 flex-shrink-0 text-frame-accent" />
              <span className="truncate">{folder.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── UploadProgressItem ───────────────────────────────────────────────────────

function UploadProgressItem({ item }: { item: UploadItem }) {
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{item.file.name}</p>
        <p className="text-xs text-frame-textMuted">{formatBytes(item.file.size)}</p>
        {item.status === 'uploading' && (
          <div className="mt-1.5 bg-frame-bg rounded-full h-1">
            <div className="bg-frame-accent h-1 rounded-full transition-all" style={{ width: `${item.progress}%` }} />
          </div>
        )}
        {item.status === 'error' && <p className="text-xs text-red-400 mt-0.5">{item.error}</p>}
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
