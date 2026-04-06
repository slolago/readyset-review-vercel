'use client';

import { useState, useEffect, useCallback } from 'react';
import { useProjects } from './useProject';
import { useAuth } from './useAuth';
import type { Project, Folder } from '@/types';

export interface ProjectTreeNode {
  project: Project;
  folders: Folder[];          // top-level folders (parentId === null)
  foldersLoaded: boolean;     // true once fetch has completed for this project
  expanded: boolean;          // UI collapse/expand state
}

export function useProjectTree() {
  const { projects, loading } = useProjects();
  const { getIdToken } = useAuth();
  const [treeNodes, setTreeNodes] = useState<ProjectTreeNode[]>([]);

  // Sync treeNodes when projects list changes — add new, preserve existing state
  useEffect(() => {
    setTreeNodes((prev) => {
      const prevMap = new Map(prev.map((n) => [n.project.id, n]));
      return projects.map((project) => {
        const existing = prevMap.get(project.id);
        if (existing) {
          // Update project data but preserve UI state
          return { ...existing, project };
        }
        return { project, folders: [], foldersLoaded: false, expanded: false };
      });
    });
  }, [projects]);

  const toggleProject = useCallback(
    async (projectId: string) => {
      setTreeNodes((prev) =>
        prev.map((node) => {
          if (node.project.id !== projectId) return node;
          return { ...node, expanded: !node.expanded };
        })
      );

      // Check if we need to load folders (find current state before toggle)
      const node = treeNodes.find((n) => n.project.id === projectId);
      if (!node) return;

      // If currently collapsed (about to expand) and folders not yet loaded
      if (!node.expanded && !node.foldersLoaded) {
        try {
          const token = await getIdToken();
          const params = new URLSearchParams({ projectId, parentId: 'null' });
          const res = await fetch(`/api/folders?${params}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error('Failed to fetch folders');
          const data = await res.json();
          setTreeNodes((prev) =>
            prev.map((n) => {
              if (n.project.id !== projectId) return n;
              return { ...n, folders: data.folders, foldersLoaded: true };
            })
          );
        } catch (err) {
          console.error('Failed to fetch folders for project', projectId, err);
          // Mark as loaded even on error to avoid infinite retries
          setTreeNodes((prev) =>
            prev.map((n) => {
              if (n.project.id !== projectId) return n;
              return { ...n, foldersLoaded: true };
            })
          );
        }
      }
    },
    [treeNodes, getIdToken]
  );

  return { treeNodes, loading, toggleProject };
}
