'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { useProjects } from './useProject';
import type { Project, Folder } from '@/types';

export interface ProjectTreeNode {
  project: Project;
  folders: Folder[];          // top-level folders (parentId === null)
  foldersLoaded: boolean;     // true once fetch has completed for this project
  expanded: boolean;          // UI collapse/expand state
}

export function useProjectTree() {
  const { projects, loading } = useProjects();
  const [treeNodes, setTreeNodes] = useState<ProjectTreeNode[]>([]);
  // Map of projectId -> Firestore unsubscribe function for folder listeners
  const folderUnsubs = useRef<Map<string, () => void>>(new Map());

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

  // Clean up all folder listeners when the hook unmounts
  useEffect(() => {
    const unsubs = folderUnsubs.current;
    return () => {
      unsubs.forEach((unsub) => unsub());
      unsubs.clear();
    };
  }, []);

  const toggleProject = useCallback(
    (projectId: string) => {
      setTreeNodes((prev) =>
        prev.map((node) => {
          if (node.project.id !== projectId) return node;
          return { ...node, expanded: !node.expanded };
        })
      );

      // Check if we need to subscribe to folders (find current state before toggle)
      const node = treeNodes.find((n) => n.project.id === projectId);
      if (!node) return;

      // If currently collapsed (about to expand) and folders not yet subscribed
      if (!node.expanded && !node.foldersLoaded) {
        // Avoid double-subscribing if a listener is already registered
        if (folderUnsubs.current.has(projectId)) return;

        const foldersQuery = query(
          collection(db, 'folders'),
          where('projectId', '==', projectId),
          where('parentId', '==', null)
        );
        const unsub = onSnapshot(
          foldersQuery,
          (snap) => {
            const folders = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Folder));
            setTreeNodes((prev) =>
              prev.map((n) => {
                if (n.project.id !== projectId) return n;
                return { ...n, folders, foldersLoaded: true };
              })
            );
          },
          (err) => {
            console.error('Failed to subscribe to folders for project', projectId, err);
            // Mark as loaded even on error to avoid infinite retries
            setTreeNodes((prev) =>
              prev.map((n) => {
                if (n.project.id !== projectId) return n;
                return { ...n, foldersLoaded: true };
              })
            );
          }
        );
        folderUnsubs.current.set(projectId, unsub);
      }
    },
    [treeNodes]
  );

  return { treeNodes, loading, toggleProject };
}
