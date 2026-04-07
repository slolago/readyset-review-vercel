'use client';

import { useState, useEffect, useCallback } from 'react';
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
  const { user, getIdToken } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    if (!user) {
      setProjects([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const token = await getIdToken();
      const res = await fetch('/api/projects', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch projects');
      const data = await res.json();
      setProjects(data.projects ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [user, getIdToken]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return { projects, loading, error, refetch: fetchProjects };
}
