'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { useAuth } from './useAuth';
import type { Project, Folder } from '@/types';

export function useProject(projectId?: string) {
  const { getIdToken } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProject = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch project');
      const data = await res.json();
      setProject(data.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [projectId, getIdToken]);

  const fetchFolders = useCallback(
    async (parentId: string | null = null) => {
      if (!projectId) return;
      try {
        const token = await getIdToken();
        const params = new URLSearchParams({ projectId });
        if (parentId) params.set('parentId', parentId);
        const res = await fetch(`/api/folders?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to fetch folders');
        const data = await res.json();
        setFolders(data.folders);
      } catch (err) {
        console.error('Failed to fetch folders:', err);
      }
    },
    [projectId, getIdToken]
  );

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  return { project, folders, loading, error, refetch: fetchProject, fetchFolders };
}

export function useProjects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setProjects([]);
      setLoading(false);
      return;
    }

    // Merge helper — deduplicates by id, preserving the latest snapshot data
    const mergeProjects = (owned: Project[], collab: Project[]): Project[] => {
      const map = new Map<string, Project>();
      for (const p of owned) map.set(p.id, p);
      for (const p of collab) map.set(p.id, p);
      return Array.from(map.values());
    };

    let ownedList: Project[] = [];
    let collabList: Project[] = [];
    let ownedReady = false;
    let collabReady = false;

    const flush = () => {
      if (ownedReady && collabReady) {
        setProjects(mergeProjects(ownedList, collabList));
        setLoading(false);
      }
    };

    // Listener 1: projects owned by the current user
    const ownedQuery = query(
      collection(db, 'projects'),
      where('ownerId', '==', user.id)
    );
    const unsubOwned = onSnapshot(
      ownedQuery,
      (snap) => {
        ownedList = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Project));
        ownedReady = true;
        flush();
      },
      (err) => {
        console.error('useProjects owned snapshot error:', err);
        setError(err.message);
        ownedReady = true;
        flush();
      }
    );

    // Listener 2: projects where the user is a collaborator
    const collabQuery = query(
      collection(db, 'projects'),
      where('collaborators', 'array-contains', { userId: user.id } as any)
    );
    const unsubCollab = onSnapshot(
      collabQuery,
      (snap) => {
        collabList = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Project));
        collabReady = true;
        flush();
      },
      (err) => {
        // Collaborator query may fail for users with no collaborator entries — treat as empty
        console.warn('useProjects collab snapshot error (non-fatal):', err);
        collabReady = true;
        flush();
      }
    );

    return () => {
      unsubOwned();
      unsubCollab();
    };
  }, [user]);

  // refetch is a no-op: the onSnapshot listeners keep data current automatically.
  // Kept in the return value for API compatibility with existing callers.
  const refetch = useCallback(() => {}, []);

  return { projects, loading, error, refetch };
}
