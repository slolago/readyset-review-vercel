'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { UserSearchCombobox } from '@/components/ui/UserSearchCombobox';
import type { UserResult } from '@/components/ui/UserSearchCombobox';
import { useAuth } from '@/hooks/useAuth';
import type { Project, Collaborator } from '@/types';
import { Trash2, UserPlus, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface CollaboratorsPanelProps {
  project: Project;
  onClose: () => void;
  onUpdated: () => void;
}

const ROLE_COLORS: Record<string, 'purple' | 'success' | 'info'> = {
  owner: 'purple',
  editor: 'success',
  reviewer: 'info',
};

export function CollaboratorsPanel({ project, onClose, onUpdated }: CollaboratorsPanelProps) {
  const { user, getIdToken } = useAuth();
  const [pending, setPending] = useState<UserResult[]>([]);
  const [role, setRole] = useState<'editor' | 'reviewer'>('reviewer');
  const [loading, setLoading] = useState(false);
  const isOwner = project.ownerId === user?.id;

  // Build the list of user IDs to exclude from search results:
  // the project owner, all existing collaborators, and users already queued
  // in the pending chip list (can't add the same user twice in one batch).
  const excludeIds = [
    project.ownerId,
    ...(project.collaborators?.map((c) => c.userId) ?? []),
    ...pending.map((p) => p.id),
  ];

  const addPending = (u: UserResult) => {
    setPending((prev) => (prev.some((p) => p.id === u.id) ? prev : [...prev, u]));
  };

  const removePending = (id: string) => {
    setPending((prev) => prev.filter((p) => p.id !== id));
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending.length === 0) return;
    setLoading(true);
    try {
      const token = await getIdToken();
      // API takes one collaborator at a time — send sequentially so we can
      // report per-user failures without rolling back earlier successes.
      const results = await Promise.allSettled(
        pending.map((u) =>
          fetch(`/api/projects/${project.id}/collaborators`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ email: u.email, role }),
          }).then(async (res) => {
            if (!res.ok) {
              const data = await res.json().catch(() => null);
              throw new Error(data?.error || `Failed to add ${u.name}`);
            }
          })
        )
      );
      const failed = results.filter((r) => r.status === 'rejected');
      const okCount = pending.length - failed.length;
      if (okCount > 0) {
        toast.success(
          okCount === 1
            ? 'Collaborator added'
            : `${okCount} collaborators added`
        );
      }
      failed.forEach((f) => {
        if (f.status === 'rejected') {
          toast.error(f.reason instanceof Error ? f.reason.message : 'Failed to add');
        }
      });
      setPending([]);
      onUpdated();
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/projects/${project.id}/collaborators`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        toast.success('Collaborator removed');
        onUpdated();
      }
    } catch {
      toast.error('Failed to remove collaborator');
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Manage Collaborators" size="md">
      <div className="space-y-5">
        {/* Current collaborators */}
        <div>
          <h3 className="text-sm font-medium text-frame-textSecondary mb-3">
            Members ({project.collaborators?.length || 0})
          </h3>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {project.collaborators?.map((collab: Collaborator) => (
              <div
                key={collab.userId}
                className="flex items-center gap-3 px-3 py-2.5 bg-frame-bg rounded-lg border border-frame-border"
              >
                <Avatar name={collab.name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{collab.name}</p>
                  <p className="text-xs text-frame-textMuted truncate">{collab.email}</p>
                </div>
                <Badge variant={ROLE_COLORS[collab.role] || 'info'}>
                  {collab.role}
                </Badge>
                {isOwner && collab.role !== 'owner' && (
                  <button
                    onClick={() => handleRemove(collab.userId)}
                    className="text-frame-textMuted hover:text-red-400 transition-colors p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Add collaborator */}
        {isOwner && (
          <form
            onSubmit={handleAdd}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
            className="border-t border-frame-border pt-5"
          >
            <h3 className="text-sm font-medium text-frame-textSecondary mb-3">
              Invite member
            </h3>
            <div className="flex gap-2 mb-3">
              <UserSearchCombobox
                onSelect={addPending}
                onClear={() => {}}
                exclude={excludeIds}
                placeholder="Search by name or email..."
                disabled={loading}
                clearOnSelect
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'editor' | 'reviewer')}
                className="bg-frame-bg border border-frame-border rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-frame-accent"
              >
                <option value="reviewer">Reviewer</option>
                <option value="editor">Editor</option>
              </select>
            </div>

            {pending.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {pending.map((u) => (
                  <span
                    key={u.id}
                    className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full bg-frame-bg border border-frame-border text-xs text-white"
                  >
                    <Avatar name={u.name} size="xs" />
                    <span className="max-w-[140px] truncate">{u.name}</span>
                    <button
                      type="button"
                      onClick={() => removePending(u.id)}
                      className="p-0.5 text-frame-textMuted hover:text-red-400 transition-colors"
                      aria-label={`Remove ${u.name}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <Button
              type="submit"
              loading={loading}
              disabled={pending.length === 0}
              icon={<UserPlus className="w-4 h-4" />}
              className="w-full"
            >
              {pending.length > 1
                ? `Add ${pending.length} Collaborators`
                : 'Add Collaborator'}
            </Button>
          </form>
        )}
      </div>
    </Modal>
  );
}
