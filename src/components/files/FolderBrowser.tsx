'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useProject } from '@/hooks/useProject';
import { useAssets, useUpload } from '@/hooks/useAssets';
import { AssetGrid } from './AssetGrid';
import { AssetListView } from './AssetListView';
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
  LayoutGrid,
  LayoutList,
  Download,
  GitCompare,
  ArrowUpDown,
  Film,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import type { Folder as FolderType, UploadItem } from '@/types';
import type { ReviewStatus } from '@/types';
import { getProjectColor, formatBytes, forceDownload } from '@/lib/utils';
import { FILE_INPUT_ACCEPT } from '@/lib/file-types';
import { selectionStyle } from '@/lib/selectionStyle';
import { Dropdown } from '@/components/ui/Dropdown';
import { ContextMenuProvider, useContextMenuController } from '@/components/ui/ContextMenu';
import toast from 'react-hot-toast';
import { CreateReviewLinkModal } from '@/components/review/CreateReviewLinkModal';
import { AddToReviewLinkModal } from '@/components/review/AddToReviewLinkModal';
import { AssetCompareModal } from './AssetCompareModal';

interface FolderBrowserProps {
  projectId: string;
  folderId: string | null;
  ancestorPath?: string; // comma-separated ancestor folder IDs from URL, used when Firestore parentId chain is missing
}

export function FolderBrowser(props: FolderBrowserProps) {
  return (
    <ContextMenuProvider>
      <FolderBrowserInner {...props} />
    </ContextMenuProvider>
  );
}

function FolderBrowserInner({ projectId, folderId, ancestorPath = '' }: FolderBrowserProps) {
  const { user, getIdToken } = useAuth();
  const confirm = useConfirm();
  const router = useRouter();
  const { project, loading: projectLoading, refetch: refetchProject } = useProject(projectId);
  const { assets, loading: assetsLoading, refetch: refetchAssets } = useAssets(projectId, folderId);
  const { uploads, uploadFile, clearCompleted, cancelUpload } = useUpload();

  // Surface a summary toast when a batch of uploads finishes (all reached a
  // terminal state). Only fires when the last active upload settles.
  const prevActiveRef = useRef(0);
  useEffect(() => {
    const active = uploads.filter((u) => u.status === 'uploading' || u.status === 'pending').length;
    const total = uploads.length;
    if (total > 0 && prevActiveRef.current > 0 && active === 0) {
      const done = uploads.filter((u) => u.status === 'complete').length;
      const failed = uploads.filter((u) => u.status === 'error').length;
      const cancelled = uploads.filter((u) => u.status === 'cancelled').length;
      if (failed === 0 && cancelled === 0) {
        toast.success(done === 1 ? 'Upload complete' : `Uploaded ${done} files`);
      } else if (done === 0) {
        toast.error(failed > 0 ? `All ${total} uploads failed` : `All ${total} uploads cancelled`);
      } else {
        toast(`Uploaded ${done} of ${total}${failed ? ` — ${failed} failed` : ''}${cancelled ? ` — ${cancelled} cancelled` : ''}`);
      }
    }
    prevActiveRef.current = active;
  }, [uploads]);

  const [folders, setFolders] = useState<FolderType[]>([]);
  const [currentFolder, setCurrentFolder] = useState<FolderType | null>(null);
  const [ancestorFolders, setAncestorFolders] = useState<FolderType[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string | null; name: string }>>([]);

  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectionReviewIds, setSelectionReviewIds] = useState<string[] | null>(null);
  const [folderReviewTarget, setFolderReviewTarget] = useState<string | null>(null);
  const [addToLinkTarget, setAddToLinkTarget] = useState<{ assetIds?: string[]; folderIds?: string[] } | null>(null);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [allFolders, setAllFolders] = useState<FolderType[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement>(null);

  // Close status menu on outside click
  useEffect(() => {
    if (!showStatusMenu) return;
    const handler = (e: MouseEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setShowStatusMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showStatusMenu]);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rubberBand, setRubberBand] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // View mode: 'grid' | 'list', persisted per folder
  const viewModeKey = `view-mode-${folderId ?? 'root'}`;
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    if (typeof window === 'undefined') return 'grid';
    return (localStorage.getItem(viewModeKey) as 'grid' | 'list') ?? 'grid';
  });

  useEffect(() => {
    localStorage.setItem(viewModeKey, viewMode);
  }, [viewModeKey, viewMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(viewModeKey) as 'grid' | 'list' | null;
    if (stored) setViewMode(stored);
  }, [viewModeKey]);

  // Sort state — global (not per folder), persisted across sessions
  const SORT_KEY_STORAGE = 'files-sort';
  type SortKey = 'name-asc' | 'name-desc' | 'date-asc' | 'date-desc';
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    if (typeof window === 'undefined') return 'date-desc';
    return (localStorage.getItem(SORT_KEY_STORAGE) as SortKey) ?? 'date-desc';
  });
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(SORT_KEY_STORAGE, sortKey);
  }, [sortKey]);

  // Sort helpers — treat folders and assets separately so folders always
  // group at the top of the grid view (standard file manager convention).
  const getMillis = (v: unknown): number => {
    if (!v) return 0;
    if (typeof (v as { toMillis?: () => number }).toMillis === 'function') {
      return (v as { toMillis: () => number }).toMillis();
    }
    if (typeof (v as { _seconds?: number })._seconds === 'number') {
      return (v as { _seconds: number })._seconds * 1000;
    }
    return 0;
  };
  const sortedFolders = useMemo(() => {
    const arr = [...folders];
    switch (sortKey) {
      case 'name-asc': return arr.sort((a, b) => a.name.localeCompare(b.name));
      case 'name-desc': return arr.sort((a, b) => b.name.localeCompare(a.name));
      case 'date-asc': return arr.sort((a, b) => getMillis(a.createdAt) - getMillis(b.createdAt));
      case 'date-desc': return arr.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
    }
  }, [folders, sortKey]);
  const sortedAssets = useMemo(() => {
    const arr = [...assets];
    switch (sortKey) {
      case 'name-asc': return arr.sort((a, b) => a.name.localeCompare(b.name));
      case 'name-desc': return arr.sort((a, b) => b.name.localeCompare(a.name));
      case 'date-asc': return arr.sort((a, b) => getMillis(a.createdAt) - getMillis(b.createdAt));
      case 'date-desc': return arr.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
    }
  }, [assets, sortKey]);

  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const rubberBandRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // Drag-to-drop state (file/folder upload from OS)
  const [isDragActive, setIsDragActive] = useState(false);
  const dropDragCounter = useRef(0);

  // Drag-to-move state (move selected items by dropping onto a folder card)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  // Drag-to-version-stack state (merge asset into another asset's version group)
  const [dragOverAssetId, setDragOverAssetId] = useState<string | null>(null);

  const ctxMenu = useContextMenuController();

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

  // Folder size badge
  const [folderSize, setFolderSize] = useState<number | null>(null);
  const [folderSizeLoading, setFolderSizeLoading] = useState(false);

  useEffect(() => {
    setFolderSize(null);
    setFolderSizeLoading(true);
    const params = new URLSearchParams({ projectId });
    if (folderId) params.set('folderId', folderId);

    getIdToken().then((token) =>
      fetch(`/api/assets/size?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => {
          setFolderSize(typeof data.sizeBytes === 'number' ? data.sizeBytes : null);
          setFolderSizeLoading(false);
        })
        .catch(() => setFolderSizeLoading(false))
    );
  }, [projectId, folderId, getIdToken]);

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

  // Track the last clicked item so shift-click can extend the range from it.
  const lastClickedIdRef = useRef<string | null>(null);

  const toggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Shift+click selects the contiguous range between lastClicked and this item.
    // Uses the current visible order of folders+assets to compute the range.
    if (e.shiftKey && lastClickedIdRef.current) {
      const order = [...folders.map((f) => f.id), ...assets.map((a) => a.id)];
      const from = order.indexOf(lastClickedIdRef.current);
      const to = order.indexOf(id);
      if (from !== -1 && to !== -1) {
        const [start, end] = from < to ? [from, to] : [to, from];
        const rangeIds = order.slice(start, end + 1);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          rangeIds.forEach((rid) => next.add(rid));
          return next;
        });
        return;
      }
    }
    lastClickedIdRef.current = id;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [folders, assets]);

  const handleItemDragStart = useCallback((itemId: string, e: React.DragEvent) => {
    // Carry all selected IDs when dragging a selected item; otherwise just this item
    const ids = selectedIds.has(itemId) ? Array.from(selectedIds) : [itemId];
    e.dataTransfer.setData('application/x-frame-move', JSON.stringify({ ids }));
    // Also advertise as version-stack draggable (single asset only — multi-select stack not supported)
    e.dataTransfer.setData('application/x-frame-version-stack', JSON.stringify({ id: itemId }));
    e.dataTransfer.effectAllowed = 'move';
  }, [selectedIds]);

  // ── Batch actions ────────────────────────────────────────────────────────
  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    const assetIds = ids.filter((id) => assets.some((a) => a.id === id));
    const folderIds = ids.filter((id) => folders.some((f) => f.id === id));
    const parts: string[] = [];
    if (assetIds.length) parts.push(`${assetIds.length} asset${assetIds.length === 1 ? '' : 's'}`);
    if (folderIds.length) parts.push(`${folderIds.length} folder${folderIds.length === 1 ? '' : 's'}`);
    const summary = parts.join(' and ');
    const ok = await confirm({
      title: `Delete ${summary}?`,
      message: `${folderIds.length ? 'Sub-folders will be deleted; their assets moved to project root.\n\n' : ''}This cannot be undone.`,
      destructive: true,
    });
    if (!ok) return;
    try {
      const token = await getIdToken();

      const results = await Promise.allSettled([
        ...assetIds.map((id) =>
          fetch(`/api/assets/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
        ),
        ...folderIds.map((id) =>
          fetch(`/api/folders/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
        ),
      ]);

      const failed = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok));
      if (failed.length === 0) {
        toast.success(`Deleted ${summary}`);
      } else if (failed.length === results.length) {
        toast.error(`Failed to delete any items`);
      } else {
        toast.error(`Deleted ${results.length - failed.length} of ${results.length} — ${failed.length} failed`);
      }
      setSelectedIds(new Set());
      refetchAssets();
      fetchFolders();
    } catch {
      toast.error('Failed to delete items');
    }
  };

  const handleDownloadSelected = useCallback(async () => {
    const selectedAssets = assets.filter(a => selectedIds.has(a.id));
    for (const asset of selectedAssets) {
      const url = (asset as any).downloadUrl ?? (asset as any).signedUrl as string | undefined;
      if (!url) continue;
      await forceDownload(url, asset.name);
      await new Promise(r => setTimeout(r, 300));
    }
  }, [assets, selectedIds]);

  const handleDownloadAll = useCallback(async () => {
    for (const asset of assets) {
      const url = (asset as any).downloadUrl ?? (asset as any).signedUrl as string | undefined;
      if (!url) continue;
      await forceDownload(url, asset.name);
      await new Promise(r => setTimeout(r, 300));
    }
  }, [assets]);

  const handleBulkSetStatus = async (reviewStatus: ReviewStatus | null) => {
    try {
      const token = await getIdToken();
      const assetIds = Array.from(selectedIds).filter(id => assets.some(a => a.id === id));
      // BLK-03: use allSettled so one failure doesn't abort the rest
      const results = await Promise.allSettled(
        assetIds.map(id =>
          fetch(`/api/assets/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ reviewStatus }),
          })
        )
      );

      let ok = 0;
      let fail = 0;
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value.ok) {
          ok++;
        } else {
          fail++;
          const id = assetIds[i];
          const name = assets.find((a) => a.id === id)?.name ?? id;
          console.error('Status update failed for', name, id, r.status === 'rejected' ? r.reason : r.value.status);
        }
      });

      if (fail === 0) {
        toast.success(reviewStatus ? `Status set for ${ok} asset(s)` : `Status cleared for ${ok} asset(s)`);
      } else {
        toast.error(`${ok} updated, ${fail} failed`);
      }
      refetchAssets();
    } catch {
      toast.error('Failed to update status');
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

  const handleRequestMoveItem = useCallback(async (itemId: string) => {
    setSelectedIds(new Set([itemId]));
    await handleOpenMoveModal();
  }, [handleOpenMoveModal]);

  const handleSelectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  // Global keyboard shortcuts — Delete/Backspace to delete selection,
  // Escape to clear selection, Ctrl/Cmd+A to select all.
  // Only fire when focus is not in an input/textarea/contenteditable.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return;
      // Ignore when a modal is open (any fixed-position dialog in DOM)
      if (document.querySelector('[role="dialog"], [data-modal-open="true"]')) return;

      if (e.key === 'Escape' && selectedIds.size > 0) {
        e.preventDefault();
        setSelectedIds(new Set());
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const ids = [...folders.map((f) => f.id), ...assets.map((a) => a.id)];
        setSelectedIds(new Set(ids));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds.size, folders, assets]);

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

      // BLK-02: use allSettled so one failure doesn't abort the rest
      const results = await Promise.allSettled([
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

      let ok = 0;
      let fail = 0;
      results.forEach((r, i) => {
        const id = i < assetIds.length ? assetIds[i] : folderIds[i - assetIds.length];
        const name =
          i < assetIds.length
            ? assets.find((a) => a.id === id)?.name ?? id
            : folders.find((f) => f.id === id)?.name ?? id;
        if (r.status === 'fulfilled' && r.value.ok) {
          ok++;
        } else {
          fail++;
          console.error('Move failed for', name, id, r.status === 'rejected' ? r.reason : r.value.status);
        }
      });

      if (fail === 0) toast.success(`Moved ${ok} item(s)`);
      else toast.error(`${ok} moved, ${fail} failed`);

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
    e.stopPropagation();
    dropDragCounter.current = 0;
    setIsDragActive(false);

    // Internal item drags set this custom type — ignore here, they have their own handlers
    if (e.dataTransfer.types.includes('application/x-frame-move')) return;
    if (e.dataTransfer.types.includes('application/x-frame-version-stack')) return;

    // Capture BOTH items and files synchronously. DataTransfer becomes invalid
    // after any await; some browsers populate only .files for regular file drops.
    const itemsList = e.dataTransfer.items ? Array.from(e.dataTransfer.items) : [];
    const filesList = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];

    // Try the entries path first (supports dropping whole folders)
    const entries = itemsList
      .map((item) => {
        const getEntry = (item as any).webkitGetAsEntry;
        return typeof getEntry === 'function'
          ? ((item as any).webkitGetAsEntry() as FileSystemEntry | null)
          : null;
      })
      .filter((entry): entry is FileSystemEntry => entry !== null);

    const hasDirectory = entries.some((entry) => entry.isDirectory);
    if (hasDirectory) {
      await Promise.all(entries.map((entry) => processEntry(entry, folderId)));
      fetchFolders();
      refetchAssets();
      return;
    }

    // Plain file drop — prefer dataTransfer.files which is the most reliable API
    const files = (filesList.length
      ? filesList
      : itemsList
          .map((i) => i.getAsFile())
          .filter((f): f is File => f !== null)
    ).filter((f) => f.type.startsWith('video/') || f.type.startsWith('image/'));

    if (!files.length) {
      toast.error('Drop at least one video or image file');
      return;
    }
    const results = await Promise.all(files.map((f) => uploadFile(f, projectId, folderId)));
    if (results.some((r) => r !== null)) refetchAssets();
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
    const folder = folders.find((f) => f.id === deleteFolderId);
    const folderName = folder?.name ?? 'folder';
    const ok = await confirm({
      title: `Delete "${folderName}"?`,
      message: 'All sub-folders will be deleted. Assets inside will be moved to the project root.\n\nThis cannot be undone.',
      destructive: true,
    });
    if (!ok) return;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/folders/${deleteFolderId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success(`Deleted "${folderName}"`);
        fetchFolders();
        refetchAssets();
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ? `Delete failed: ${data.error}` : 'Failed to delete folder');
      }
    } catch (err) {
      toast.error(`Failed to delete: ${(err as Error).message || 'network error'}`);
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

  // ── Drag-to-version-stack: asset drop target handlers ────────────────────
  const handleAssetDragOver = useCallback((targetAssetId: string, e: React.DragEvent) => {
    // Only accept version-stack payloads
    if (!e.dataTransfer.types.includes('application/x-frame-version-stack')) return;
    // Block dropping onto uploading/pending assets (P28-14) — belt-and-suspenders guard
    const targetAsset = assets.find((a) => a.id === targetAssetId);
    if (!targetAsset || targetAsset.status !== 'ready') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverAssetId(targetAssetId);
  }, [assets]);

  const handleAssetDragLeave = useCallback((_targetAssetId: string, _e: React.DragEvent) => {
    setDragOverAssetId(null);
  }, []);

  const handleAssetDrop = useCallback(async (targetAssetId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent event bubbling to the container handleDrop (OS upload handler)
    setDragOverAssetId(null);

    const raw = e.dataTransfer.getData('application/x-frame-version-stack');
    if (!raw) return;

    let payload: { id: string };
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    const sourceId = payload.id;
    if (!sourceId) return;

    // UI guard: self-drop no-op (P28-11) — API also returns 400
    if (sourceId === targetAssetId) return;

    // UI guard: same-group no-op (P28-11)
    const sourceAsset = assets.find((a) => a.id === sourceId);
    const targetAsset = assets.find((a) => a.id === targetAssetId);
    if (sourceAsset && targetAsset) {
      const sourceGroup = (sourceAsset as any).versionGroupId || sourceId;
      const targetGroup = (targetAsset as any).versionGroupId || targetAssetId;
      if (sourceGroup === targetGroup) return;
    }

    try {
      const token = await getIdToken();
      const res = await fetch('/api/assets/merge-version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sourceId, targetId: targetAssetId }),
      });
      if (res.ok) {
        const targetName = targetAsset?.name ?? 'version stack';
        toast.success(`Added to ${targetName}'s version stack`);
        // BLK-04: drop merged source from selection before refetch swaps it out
        setSelectedIds((prev) => {
          if (!prev.has(sourceId)) return prev;
          const next = new Set(prev);
          next.delete(sourceId);
          return next;
        });
        refetchAssets();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to merge version stack');
      }
    } catch {
      toast.error('Failed to merge version stack');
    }
  }, [assets, getIdToken, refetchAssets]);

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
        <div className="flex items-center gap-2 min-w-0">
          <Breadcrumb items={breadcrumbs} projectId={projectId} projectColor={color} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* View mode toggle */}
          <div className="flex items-center rounded-lg border border-frame-border overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              title="Grid view"
              className={`p-1.5 transition-colors ${
                viewMode === 'grid'
                  ? 'bg-frame-accent text-white'
                  : 'text-frame-textMuted hover:text-white hover:bg-frame-border'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              title="List view"
              className={`p-1.5 transition-colors ${
                viewMode === 'list'
                  ? 'bg-frame-accent text-white'
                  : 'text-frame-textMuted hover:text-white hover:bg-frame-border'
              }`}
            >
              <LayoutList className="w-4 h-4" />
            </button>
          </div>
          {/* Sort dropdown */}
          <Dropdown
            trigger={
              <button
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-frame-border text-frame-textSecondary hover:text-white hover:border-frame-borderLight transition-colors"
                title="Sort files"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                {{
                  'name-asc': 'Name A–Z',
                  'name-desc': 'Name Z–A',
                  'date-asc': 'Oldest first',
                  'date-desc': 'Newest first',
                }[sortKey]}
              </button>
            }
            items={[
              { label: 'Newest first', icon: <ArrowUpDown className="w-4 h-4" />, onClick: () => setSortKey('date-desc') },
              { label: 'Oldest first', icon: <ArrowUpDown className="w-4 h-4" />, onClick: () => setSortKey('date-asc') },
              { label: 'Name A–Z', icon: <ArrowUpDown className="w-4 h-4" />, onClick: () => setSortKey('name-asc') },
              { label: 'Name Z–A', icon: <ArrowUpDown className="w-4 h-4" />, onClick: () => setSortKey('name-desc') },
            ]}
          />
          <Button variant="ghost" size="sm" onClick={() => setShowCollaborators(true)} icon={<Users className="w-4 h-4" />}>
            Team
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowReviewModal(true)} icon={<LinkIcon className="w-4 h-4" />}>
            Share
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowCreateFolder(true)} icon={<Plus className="w-4 h-4" />}>
            New Folder
          </Button>
          <Dropdown
            trigger={
              <Button size="sm" icon={<Upload className="w-4 h-4" />}>
                Upload
              </Button>
            }
            items={[
              { label: 'Upload files', icon: <Upload className="w-4 h-4" />, onClick: () => fileInputRef.current?.click() },
              { label: 'Upload folder', icon: <FolderOpen className="w-4 h-4" />, onClick: () => folderInputRef.current?.click() },
            ]}
          />
        </div>
      </div>

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" className="hidden" multiple accept={FILE_INPUT_ACCEPT} onChange={handleFileInputChange} />
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
        onContextMenu={(e) => {
          const card = (e.target as HTMLElement).closest('[data-selectable]');
          if (card) return; // card's own handler fires via stopPropagation
          e.preventDefault();
          ctxMenu.open('canvas', { x: e.clientX, y: e.clientY }, [
            { label: 'New Folder', icon: <Plus className="w-4 h-4" />, onClick: () => setShowCreateFolder(true) },
            { label: 'Upload files', icon: <Upload className="w-4 h-4" />, onClick: () => fileInputRef.current?.click() },
            { label: 'Upload folder', icon: <FolderOpen className="w-4 h-4" />, onClick: () => folderInputRef.current?.click() },
            { label: 'Download all', icon: <Download className="w-4 h-4" />, onClick: handleDownloadAll, dividerBefore: true, disabled: assets.length === 0 },
          ]);
        }}
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
              {sortedFolders.map((folder) => (
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
                  onCreateReviewLink={() => setFolderReviewTarget(folder.id)}
                  onAddToReviewLink={() => setAddToLinkTarget({ folderIds: [folder.id] })}
                  onRequestMove={() => handleRequestMoveItem(folder.id)}
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
        ) : viewMode === 'list' ? (
          <AssetListView
            assets={sortedAssets}
            projectId={projectId}
            onAssetDeleted={refetchAssets}
            onVersionUploaded={refetchAssets}
            onCopied={refetchAssets}
            onDuplicated={refetchAssets}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onSelectAll={handleSelectAll}
            onAssetDragStart={handleItemDragStart}
            onRequestMove={handleRequestMoveItem}
          />
        ) : (
          <AssetGrid
            assets={sortedAssets}
            projectId={projectId}
            onAssetDeleted={refetchAssets}
            onVersionUploaded={refetchAssets}
            onCopied={refetchAssets}
            onDuplicated={refetchAssets}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onAssetDragStart={handleItemDragStart}
            onRequestMove={handleRequestMoveItem}
            onCreateReviewLink={(assetId) => { setSelectionReviewIds([assetId]); setShowReviewModal(true); }}
            onAddToReviewLink={(assetId) => setAddToLinkTarget({ assetIds: [assetId] })}
            dragOverAssetId={dragOverAssetId}
            onAssetDragOver={handleAssetDragOver}
            onAssetDragLeave={handleAssetDragLeave}
            onAssetDrop={handleAssetDrop}
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
          {(() => {
            const selectedAssets = assets.filter((a) => selectedIds.has(a.id));
            const canCompare = selectedAssets.length === 2;
            return (
              <button
                onClick={() => canCompare && setShowCompareModal(true)}
                disabled={!canCompare}
                title={canCompare ? 'Compare assets' : 'Select exactly 2 assets to compare'}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  canCompare
                    ? 'text-white bg-frame-accent hover:bg-frame-accent/80'
                    : 'text-white/30 bg-frame-border cursor-not-allowed'
                }`}
              >
                <GitCompare className="w-3.5 h-3.5" />
                Compare
              </button>
            );
          })()}
          {(() => {
            const count = selectedIds.size;
            const overCap = count > 50;
            return (
              <button
                onClick={() => {
                  if (overCap) {
                    toast.error('Select 50 or fewer assets to create a review link');
                    return;
                  }
                  // Only pass asset IDs (not folder IDs) to the review link API
                  const assetOnlyIds = Array.from(selectedIds).filter(id => assets.some(a => a.id === id));
                  setSelectionReviewIds(assetOnlyIds);
                  setShowReviewModal(true);
                }}
                title={overCap ? 'Select 50 or fewer assets' : 'Create review link from selection'}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  overCap
                    ? 'text-white/30 bg-frame-border cursor-not-allowed'
                    : 'text-white bg-frame-accent hover:bg-frame-accent/80'
                }`}
              >
                <LinkIcon className="w-3.5 h-3.5" />
                Review link
              </button>
            );
          })()}
          <button
            onClick={() => {
              const assetOnlyIds = Array.from(selectedIds).filter(id => assets.some(a => a.id === id));
              const folderOnlyIds = Array.from(selectedIds).filter(id => folders.some(f => f.id === id));
              if (!assetOnlyIds.length && !folderOnlyIds.length) return;
              setAddToLinkTarget({ assetIds: assetOnlyIds, folderIds: folderOnlyIds });
            }}
            title="Add selection to an existing review link"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-frame-border hover:bg-frame-borderLight rounded-lg transition-colors"
          >
            <LinkIcon className="w-3.5 h-3.5" />
            Add to link
          </button>
          {(() => {
            const selectedAssets = assets.filter(a => selectedIds.has(a.id));
            const sharedStatus = selectedAssets.length > 0 && selectedAssets.every(a => a.reviewStatus === selectedAssets[0].reviewStatus)
              ? selectedAssets[0].reviewStatus
              : undefined;
            const STATUS_OPTIONS: { value: ReviewStatus | null; label: string; color: string }[] = [
              { value: 'approved', label: 'Approved', color: 'bg-emerald-400' },
              { value: 'in_review', label: 'In Review', color: 'bg-blue-400' },
              { value: 'needs_revision', label: 'Needs Revision', color: 'bg-yellow-400' },
            ];
            return (
              <div className="relative" ref={statusMenuRef}>
                <button
                  onClick={() => setShowStatusMenu(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-frame-border hover:bg-frame-borderLight rounded-lg transition-colors"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Status
                </button>
                {showStatusMenu && (
                  <div className="absolute bottom-full mb-2 left-0 z-50 bg-frame-card border border-frame-border rounded-xl shadow-2xl py-1 min-w-[170px]">
                    {STATUS_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => { handleBulkSetStatus(opt.value); setShowStatusMenu(false); }}
                        className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors text-left ${
                          sharedStatus === opt.value
                            ? 'text-white bg-frame-cardHover'
                            : 'text-frame-textSecondary hover:text-white hover:bg-frame-cardHover'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${opt.color}`} />
                        {opt.label}
                        {sharedStatus === opt.value && <Check className="w-3 h-3 ml-auto text-frame-accent" />}
                      </button>
                    ))}
                    <div className="my-1 border-t border-frame-border" />
                    <button
                      onClick={() => { handleBulkSetStatus(null); setShowStatusMenu(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-frame-textMuted hover:text-white hover:bg-frame-cardHover transition-colors text-left"
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0 bg-white/20" />
                      Clear status
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
          <button
            onClick={handleOpenMoveModal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-frame-border hover:bg-frame-borderLight rounded-lg transition-colors"
          >
            <Move className="w-3.5 h-3.5" />
            Move
          </button>
          <button
            onClick={handleDownloadSelected}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-frame-border hover:bg-frame-borderLight rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download
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
              <UploadProgressItem key={upload.id} item={upload} onCancel={cancelUpload} />
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
          folderId={selectionReviewIds ? null : folderId}
          assetIds={selectionReviewIds ?? undefined}
          onClose={() => { setShowReviewModal(false); setSelectionReviewIds(null); }}
        />
      )}

      {folderReviewTarget !== null && (
        <CreateReviewLinkModal
          projectId={projectId}
          folderId={folderReviewTarget}
          onClose={() => setFolderReviewTarget(null)}
        />
      )}

      {addToLinkTarget && (
        <AddToReviewLinkModal
          projectId={projectId}
          assetIds={addToLinkTarget.assetIds}
          folderIds={addToLinkTarget.folderIds}
          onClose={() => setAddToLinkTarget(null)}
          onCreateNew={() => {
            // Fall back to the create-link modal with the same items pre-selected
            const a = addToLinkTarget.assetIds ?? [];
            setAddToLinkTarget(null);
            if (a.length) {
              setSelectionReviewIds(a);
              setShowReviewModal(true);
            } else {
              // No assets, only folders — current create modal doesn't support folder arrays.
              // Open generic modal at project scope; user can add folders from contents editor afterward.
              setShowReviewModal(true);
            }
          }}
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

      {showCompareModal && (() => {
        const selectedAssets = assets.filter((a) => selectedIds.has(a.id));
        const canCompare = selectedAssets.length === 2;
        return canCompare ? (
          <AssetCompareModal
            assetA={selectedAssets[0]}
            assetB={selectedAssets[1]}
            onClose={() => setShowCompareModal(false)}
            projectId={projectId}
            getIdToken={getIdToken}
          />
        ) : null;
      })()}

      {/* Folder size overlay */}
      {!folderSizeLoading && folderSize !== null && folderSize > 0 && (
        <div className="fixed bottom-6 right-6 z-10 bg-frame-card border border-frame-border rounded-lg px-3 py-1.5 text-xs text-frame-textMuted shadow-lg pointer-events-none">
          {formatBytes(folderSize)}
        </div>
      )}
    </div>
  );
}

// ── FolderCard ───────────────────────────────────────────────────────────────

const FolderCard = React.memo(function FolderCard({
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
  onCreateReviewLink,
  onAddToReviewLink,
  onRequestMove,
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
  onAddToReviewLink?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onCreateReviewLink?: () => void;
  onRequestMove?: () => void;
}) {
  const router = useRouter();
  const { getIdToken } = useAuth();
  const ctxMenu = useContextMenuController();
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [showFolderCopyModal, setShowFolderCopyModal] = useState(false);
  const [preview, setPreview] = useState<
    Array<{ id: string; type: string; name: string; thumbnailSignedUrl?: string; signedUrl?: string }>
  >([]);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch(`/api/folders/${folder.id}/preview-assets`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!controller.signal.aborted) setPreview(data.assets ?? []);
      } catch {
        /* ignore — fallback to folder icon */
      }
    })();
    return () => controller.abort();
  }, [folder.id, getIdToken]);

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
      className={[
        'group relative bg-frame-card rounded-xl overflow-hidden cursor-pointer transition-all hover:bg-frame-cardHover',
        selectionStyle('folder', (isDropTarget || isSelected) ? 'selected' : 'idle'),
        isDropTarget ? 'ring-2 ring-frame-accent bg-frame-accent/10' : '',
      ].filter(Boolean).join(' ')}
      onClick={(e) => {
        if (e.button !== 0) return; // ignore right-click
        const url = `/projects/${projectId}/folders/${folder.id}${ancestorPath ? `?path=${ancestorPath}` : ''}`;
        router.push(url);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        ctxMenu.open(`folder-${folder.id}`, { x: e.clientX, y: e.clientY }, [
          { label: 'Open', icon: <FolderOpen className="w-4 h-4" />, onClick: () => router.push(`/projects/${projectId}/folders/${folder.id}${ancestorPath ? `?path=${ancestorPath}` : ''}`) },
          { label: 'Rename', icon: <Pencil className="w-4 h-4" />, onClick: handleRenameFolder },
          { label: 'Duplicate', icon: <CopyPlus className="w-4 h-4" />, onClick: onDuplicate ?? (() => {}) },
          { label: 'Copy to', icon: <Copy className="w-4 h-4" />, onClick: handleOpenCopyModal },
          { label: 'Move to', icon: <Move className="w-4 h-4" />, onClick: () => onRequestMove?.() },
          { label: 'Create review link', icon: <LinkIcon className="w-4 h-4" />, onClick: onCreateReviewLink ?? (() => {}) },
          { label: 'Add to review link…', icon: <LinkIcon className="w-4 h-4" />, onClick: onAddToReviewLink ?? (() => {}) },
          { label: 'Delete', icon: <Trash2 className="w-4 h-4" />, onClick: onDelete, danger: true, dividerBefore: true },
        ]);
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Full-width thumbnail area — mirrors AssetCard's aspect-video slot
          so folder cards read as siblings of asset cards in the grid.
          Empty folders fall back to a centered Folder icon. */}
      <div className="relative aspect-video bg-black overflow-hidden">
        {preview.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center bg-frame-bg">
            <Folder className="w-12 h-12 text-frame-accent/70" />
          </div>
        ) : (
          <div
            className={`absolute inset-0 grid gap-[2px] bg-frame-border ${
              preview.length === 1
                ? 'grid-cols-1 grid-rows-1'
                : preview.length === 2
                ? 'grid-cols-2 grid-rows-1'
                : 'grid-cols-2 grid-rows-2'
            }`}
          >
            {preview.map((a) => {
              const src = a.thumbnailSignedUrl ?? a.signedUrl;
              if (src && (a.type === 'image' || a.type === 'video')) {
                // eslint-disable-next-line @next/next/no-img-element
                return (
                  <img
                    key={a.id}
                    src={src}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                );
              }
              const Icon = a.type === 'video' ? Film : a.type === 'image' ? ImageIcon : FileText;
              return (
                <div key={a.id} className="w-full h-full flex items-center justify-center bg-frame-bg">
                  <Icon className="w-6 h-6 text-frame-textMuted" />
                </div>
              );
            })}
            {/* Fill the 4th cell when preview.length === 3 so the 2×2 grid
                stays visually balanced (otherwise the last cell collapses). */}
            {preview.length === 3 && (
              <div className="w-full h-full bg-frame-bg flex items-center justify-center">
                <Folder className="w-5 h-5 text-frame-textMuted/50" />
              </div>
            )}
          </div>
        )}

        {/* Checkbox — overlays the thumbnail, top-left */}
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

        {/* More-actions menu — overlays the thumbnail, top-right */}
        <div
          className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <Dropdown
            trigger={
              <button className="w-7 h-7 flex items-center justify-center rounded bg-black/60 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/80 transition-colors">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            }
            items={[
              { label: 'Rename', icon: <Pencil className="w-4 h-4" />, onClick: handleRenameFolder },
              { label: 'Copy to', icon: <Copy className="w-4 h-4" />, onClick: handleOpenCopyModal },
              { label: 'Move to', icon: <Move className="w-4 h-4" />, onClick: () => onRequestMove?.() },
              { label: 'Duplicate', icon: <CopyPlus className="w-4 h-4" />, onClick: onDuplicate ?? (() => {}) },
              { label: 'Create review link', icon: <LinkIcon className="w-4 h-4" />, onClick: onCreateReviewLink ?? (() => {}), divider: true },
              { label: 'Add to review link…', icon: <LinkIcon className="w-4 h-4" />, onClick: onAddToReviewLink ?? (() => {}) },
              { label: 'Delete', icon: <Trash2 className="w-4 h-4" />, onClick: onDelete, danger: true, divider: true },
            ]}
          />
        </div>

        {/* Folder-icon chip in the bottom-left — signals "this is a folder"
            regardless of which thumbnails are showing. */}
        <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm text-white/90 text-[10px] font-medium uppercase tracking-wide">
          <Folder className="w-3 h-3" />
          Folder
        </div>
      </div>

      {/* Name row */}
      <div className="p-3">
      {isRenaming ? (
        <div className="flex items-center gap-1">
          <input
            ref={renameInputRef}
            className="flex-1 bg-frame-bg border border-frame-accent rounded px-1.5 py-0.5 text-sm font-medium text-white outline-none focus:ring-1 focus:ring-frame-accent"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitFolderRename(); }
              if (e.key === 'Escape') { setIsRenaming(false); }
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            title="Confirm"
            onClick={(e) => { e.stopPropagation(); commitFolderRename(); }}
            className="p-1 rounded hover:bg-frame-accent/20 text-frame-accent"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Cancel"
            onClick={(e) => { e.stopPropagation(); setIsRenaming(false); }}
            className="p-1 rounded hover:bg-frame-border text-frame-textMuted"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <p className="text-sm font-medium text-white truncate">{folder.name}</p>
      )}
      </div>
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
});

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

function UploadProgressItem({ item, onCancel }: { item: UploadItem; onCancel?: (id: string) => void }) {
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate" title={item.file.name}>{item.file.name}</p>
        <p className="text-xs text-frame-textMuted">{formatBytes(item.file.size)}</p>
        {item.status === 'uploading' && (
          <div className="mt-1.5 bg-frame-bg rounded-full h-1">
            <div className="bg-frame-accent h-1 rounded-full transition-all" style={{ width: `${item.progress}%` }} />
          </div>
        )}
        {item.status === 'error' && <p className="text-xs text-red-400 mt-0.5">{item.error}</p>}
        {item.status === 'cancelled' && <p className="text-xs text-frame-textMuted mt-0.5">Cancelled</p>}
      </div>
      <div className="flex-shrink-0 flex items-center gap-1">
        {(item.status === 'uploading' || item.status === 'pending') && (
          <>
            <span className="text-xs text-frame-textSecondary tabular-nums">{item.progress}%</span>
            {onCancel && (
              <button
                onClick={() => onCancel(item.id)}
                title="Cancel upload"
                className="text-frame-textMuted hover:text-red-400 transition-colors p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}
        {item.status === 'complete' && <CheckCircle className="w-4 h-4 text-frame-green" />}
        {item.status === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
        {item.status === 'cancelled' && <X className="w-4 h-4 text-frame-textMuted" />}
      </div>
    </div>
  );
}
