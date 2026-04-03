'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/hooks/useAuth';
import type { Project, Collaborator } from '@/types';
import { Trash2, UserPlus } from 'lucide-react';
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
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'reviewer'>('reviewer');
  const [loading, setLoading] = useState(false);
  const isOwner = project.ownerId === user?.id;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/projects/${project.id}/collaborators`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add collaborator');
      }
      toast.success('Collaborator added');
      setEmail('');
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add collaborator');
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
          <div className="space-y-2">
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
          <form onSubmit={handleAdd} className="border-t border-frame-border pt-5">
            <h3 className="text-sm font-medium text-frame-textSecondary mb-3">
              Invite member
            </h3>
            <div className="flex gap-2 mb-3">
              <Input
                placeholder="colleague@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                className="flex-1"
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
            <Button
              type="submit"
              loading={loading}
              icon={<UserPlus className="w-4 h-4" />}
              className="w-full"
            >
              Add Collaborator
            </Button>
          </form>
        )}
      </div>
    </Modal>
  );
}
