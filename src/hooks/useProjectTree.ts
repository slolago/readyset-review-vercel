'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useProjects } from './useProject';
import { useAuth } from './useAuth';
import type { Project, Folder } from '@/types';

export interface ProjectTreeNode {
  project: Project;
  folders: Folder[];          // top-level folders (parentId === null)
  foldersLoaded: boolean;     // true once fetch has completed for this project
  expanded: boolean;          // UI collapse/expand state
}

const EXPANDED_KEY = 'project-tree-expanded';

function loadExpandedSet(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function saveExpandedSet(set: Set<string>) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(EXPANDED_KEY, JSON.stringify(Array.from(set))); } catch {}
}

export function useProjectTree() {
  const { projects, loading } = useProjects();
  const { getIdToken } = useAuth();
  const [treeNodes, setTreeNodes] = useState<ProjectTreeNode[]>([]);
  const fetchingRef = useRef<Set<string>>(new Set());

  // Sync treeNodes when projects list changes — add new, preserve existing state.
  // Restore expanded state from localStorage on the first pass.
  useEffect(() => {
    setTreeNodes((prev) => {
      const persisted = prev.length === 0 ? loadExpandedSet() : null;
      const prevMap = new Map(prev.map((n) => [n.project.id, n]));
      return projects.map((project) => {
        const existing = prevMap.get(project.id);
        if (existing) return { ...existing, project };
        return {
          project,
          folders: [],
          foldersLoaded: false,
          expanded: persisted?.has(project.id) ?? false,
        };
      });
    });
  }, [projects]);

  const toggleProject = useCallback(
    async (projectId: string) => {
      setTreeNodes((prev) => {
        const next = prev.map((node) => {
          if (node.project.id !== projectId) return node;
          return { ...node, expanded: !node.expanded };
        });
        // Persist expanded ids so sidebar state survives navigation
        saveExpandedSet(new Set(next.filter((n) => n.expanded).map((n) => n.project.id)));
        return next;
      });

      const node = treeNodes.find((n) => n.project.id === projectId);
      if (!node || node.foldersLoaded || fetchingRef.current.has(projectId)) return;
      if (!node.expanded) {
        // expanding — load folders via REST API
        fetchingRef.current.add(projectId);
        try {
          const token = await getIdToken();
          const res = await fetch(`/api/folders?projectId=${projectId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            setTreeNodes((prev) =>
              prev.map((n) =>
                n.project.id === projectId
                  ? { ...n, folders: data.folders ?? [], foldersLoaded: true }
                  : n
              )
            );
          }
        } catch {
          setTreeNodes((prev) =>
            prev.map((n) =>
              n.project.id === projectId ? { ...n, foldersLoaded: true } : n
            )
          );
        } finally {
          fetchingRef.current.delete(projectId);
        }
      }
    },
    [treeNodes, getIdToken]
  );

  return { treeNodes, loading, toggleProject };
}
