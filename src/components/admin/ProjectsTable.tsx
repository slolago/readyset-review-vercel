'use client';

import { useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { formatRelativeTime } from '@/lib/utils';
import { Trash2, ArrowRightLeft, X, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';

interface AdminProject {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: any;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  collaboratorCount: number;
}

interface ProjectsTableProps {
  projects: AdminProject[];
  loading: boolean;
  onChanged?: () => void;
  onInspectPermissions?: (projectId: string) => void;
}

export function ProjectsTable({ projects, loading, onChanged, onInspectPermissions }: ProjectsTableProps) {
  const { getIdToken } = useAuth();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [transferring, setTransferring] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleDelete = async (projectId: string) => {
    setBusyId(projectId);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error || 'Failed');
      }
      toast.success('Project deleted');
      onChanged?.();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusyId(null); setConfirmDelete(null); }
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Spinner /></div>;
  if (projects.length === 0) {
    return <div className="py-16 text-center text-frame-textSecondary text-sm">No projects found.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-frame-border">
            <th className="text-left px-6 py-3 text-xs font-semibold text-frame-textMuted uppercase tracking-wider w-2/5">Project</th>
            <th className="text-left px-6 py-3 text-xs font-semibold text-frame-textMuted uppercase tracking-wider">Owner</th>
            <th className="text-left px-6 py-3 text-xs font-semibold text-frame-textMuted uppercase tracking-wider">Collaborators</th>
            <th className="text-left px-6 py-3 text-xs font-semibold text-frame-textMuted uppercase tracking-wider">Created</th>
            <th className="px-6 py-3" />
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => {
            const createdAt = project.createdAt?.toDate?.() ?? new Date((project.createdAt as any)?._seconds * 1000 || Date.now());
            const descriptionSnippet = project.description
              ? project.description.slice(0, 40) + (project.description.length > 40 ? '…' : '')
              : '';
            const isConfirming = confirmDelete === project.id;
            const isTransfer = transferring === project.id;
            const isBusy = busyId === project.id;

            return (
              <tr
                key={project.id}
                className="border-b border-frame-border/50 hover:bg-white/[0.02] transition-colors group"
              >
                <td className="px-6 py-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: project.color }} />
                    <div>
                      {onInspectPermissions ? (
                        <button
                          type="button"
                          onClick={() => onInspectPermissions(project.id)}
                          className="text-sm font-medium text-white hover:text-frame-accent transition-colors text-left"
                        >
                          {project.name}
                        </button>
                      ) : (
                        <p className="text-sm font-medium text-white">{project.name}</p>
                      )}
                      {descriptionSnippet && (
                        <p className="text-xs text-frame-textMuted mt-0.5">{descriptionSnippet}</p>
                      )}
                    </div>
                  </div>
                </td>

                <td className="px-6 py-4">
                  <p className="text-sm text-white">{project.ownerName}</p>
                  <p className="text-xs text-frame-textMuted mt-0.5">{project.ownerEmail}</p>
                </td>

                <td className="px-6 py-4">
                  <span className="text-sm text-frame-textSecondary">{project.collaboratorCount}</span>
                </td>

                <td className="px-6 py-4">
                  <span className="text-sm text-frame-textSecondary">{formatRelativeTime(createdAt)}</span>
                </td>

                {/* Actions */}
                <td className="px-6 py-4">
                  {isConfirming ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-400">Delete permanently?</span>
                      <button
                        onClick={() => handleDelete(project.id)}
                        disabled={isBusy}
                        className="text-xs text-red-400 hover:text-red-300 font-medium disabled:opacity-50"
                      >
                        {isBusy ? '…' : 'Yes'}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="text-xs text-frame-textMuted hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : isTransfer ? (
                    <TransferOwnerForm
                      project={project}
                      onCancel={() => setTransferring(null)}
                      onDone={() => { setTransferring(null); onChanged?.(); }}
                      getIdToken={getIdToken}
                    />
                  ) : (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <button
                        onClick={() => setTransferring(project.id)}
                        title="Transfer ownership"
                        className="p-1.5 rounded text-frame-textMuted hover:text-white hover:bg-frame-border"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(project.id)}
                        title="Delete project"
                        className="p-1.5 rounded text-frame-textMuted hover:text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TransferOwnerForm({
  project, onCancel, onDone, getIdToken,
}: {
  project: AdminProject;
  onCancel: () => void;
  onDone: () => void;
  getIdToken: () => Promise<string | null>;
}) {
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) return;
    setSaving(true);
    try {
      const token = await getIdToken();
      // Resolve email → userId via users list (admin endpoint)
      const uRes = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } });
      const data = await uRes.json();
      const target = (data.users ?? []).find((u: any) => u.email?.toLowerCase() === email.trim().toLowerCase());
      if (!target) throw new Error('No user found with that email');

      const res = await fetch(`/api/admin/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newOwnerId: target.id }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error || 'Transfer failed');
      }
      toast.success(`Ownership transferred to ${target.name}`);
      onDone();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="email"
        placeholder="New owner email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoFocus
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        className="bg-frame-bg border border-frame-border rounded px-2 py-1 text-xs text-white w-44 focus:outline-none focus:border-frame-accent"
      />
      <button
        onClick={handleSubmit}
        disabled={saving || !email.trim()}
        className="p-1 rounded text-frame-accent hover:bg-frame-accent/10 disabled:opacity-50"
      >
        <Check className="w-3.5 h-3.5" />
      </button>
      <button onClick={onCancel} className="p-1 rounded text-frame-textMuted hover:text-white">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
