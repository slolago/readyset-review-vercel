'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import type { Comment } from '@/types';

export function useComments(assetId?: string, reviewToken?: string) {
  const { getIdToken } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchComments = useCallback(async () => {
    if (!assetId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ assetId });
      if (reviewToken) params.set('reviewToken', reviewToken);
      const headers: HeadersInit = {};
      if (!reviewToken) {
        const token = await getIdToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`/api/comments?${params}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments);
      }
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    } finally {
      setLoading(false);
    }
  }, [assetId, reviewToken, getIdToken]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const addComment = async (
    commentData: {
      text: string;
      timestamp?: number;
      annotation?: { shapes: string; frameTime?: number };
      parentId?: string | null;
      authorName?: string;
      authorEmail?: string;
      reviewLinkId?: string;
    },
    projectId: string
  ): Promise<boolean> => {
    if (!assetId) return false;
    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (!reviewToken) {
        const token = await getIdToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...commentData, assetId, projectId }),
      });
      if (!res.ok) return false;
      await fetchComments();
      return true;
    } catch {
      return false;
    }
  };

  const resolveComment = async (commentId: string, resolved: boolean): Promise<boolean> => {
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/comments/${commentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ resolved }),
      });
      if (!res.ok) return false;
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, resolved } : c))
      );
      return true;
    } catch {
      return false;
    }
  };

  const deleteComment = async (commentId: string): Promise<boolean> => {
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/comments/${commentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return false;
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      return true;
    } catch {
      return false;
    }
  };

  return { comments, loading, addComment, resolveComment, deleteComment, refetch: fetchComments };
}
