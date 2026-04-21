'use client';

import { useEffect, useState, useCallback, useId, useRef } from 'react';
import { X, Shield, Ban, CheckCircle2, Folder, Plus, Search, Trash2, User as UserIcon, MessageSquare, Upload } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useModalOwner } from '@/hooks/useModalOwner';
import { formatRelativeTime } from '@/lib/utils';
import type { User } from '@/types';
import toast from 'react-hot-toast';

type Role = 'admin' | 'manager' | 'editor' | 'viewer';
type ProjectRole = 'manager' | 'editor' | 'viewer';

interface ProjectMembership {
  id: string;
  name: string;
  color?: string;
  role?: string;
  collaboratorCount?: number;
}

interface DetailData {
  user: User & { disabled?: boolean };
  ownedProjects: ProjectMembership[];
  collaboratingProjects: ProjectMembership[];
  stats: { commentsAuthored: number; assetsUploaded: number };
}

interface UserDrawerProps {
  userId: string;
  onClose: () => void;
  onChanged: () => void; // called after any edit so parent can refetch list
  getIdToken: () => Promise<string | null>;
}

const ROLE_STYLES: Record<string, string> = {
  admin: 'bg-frame-accent/15 text-frame-accent',
  manager: 'bg-purple-500/15 text-purple-400',
  editor: 'bg-blue-500/15 text-blue-400',
  viewer: 'bg-white/5 text-frame-textSecondary',
};

export function UserDrawer({ userId, onClose, onChanged, getIdToken }: UserDrawerProps) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(drawerRef, true);
  useModalOwner(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setData(await res.json());
      else toast.error('Failed to load user');
    } catch { toast.error('Failed to load user'); }
    finally { setLoading(false); }
  }, [userId, getIdToken]);

  useEffect(() => { load(); }, [load]);

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error || 'Save failed');
      }
      toast.success('Saved');
      await load();
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSaving(false); }
  };

  const toggleSuspended = () => patch({ disabled: !data?.user.disabled });

  const changeRole = (role: Role) => patch({ role });

  const removeFromProject = async (projectId: string) => {
    setSaving(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/admin/users/${userId}/project-access?projectId=${projectId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error || 'Failed');
      }
      toast.success('Removed from project');
      await load();
      onChanged();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 pointer-events-auto" onClick={onClose} />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute top-0 right-0 bottom-0 w-[440px] bg-frame-sidebar border-l border-frame-border shadow-2xl pointer-events-auto flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-frame-border flex-shrink-0">
          <h2 id={titleId} className="text-sm font-semibold text-white">User details</h2>
          <button onClick={onClose} className="text-frame-textMuted hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading || !data ? (
          <div className="flex-1 flex items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Profile */}
            <div className="px-5 py-4 border-b border-frame-border">
              <div className="flex items-center gap-3">
                <Avatar src={data.user.avatar} name={data.user.name} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-white truncate">
                    {data.user.name}
                    {data.user.disabled && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-semibold align-middle">
                        Suspended
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-frame-textMuted truncate">{data.user.email}</p>
                  <p className="text-[11px] text-frame-textMuted mt-0.5">
                    Joined {data.user.createdAt ? formatRelativeTime((data.user.createdAt as any).toDate?.() ?? new Date((data.user.createdAt as any)?._seconds * 1000 || 0)) : '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Role */}
            <div className="px-5 py-4 border-b border-frame-border space-y-2">
              <h3 className="text-xs font-semibold text-frame-textMuted uppercase tracking-wider">Platform role</h3>
              <div className="grid grid-cols-4 gap-1.5">
                {(['viewer', 'editor', 'manager', 'admin'] as Role[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => changeRole(r)}
                    disabled={saving || data.user.role === r}
                    className={`px-2 py-1.5 text-xs rounded-lg border font-medium transition-colors capitalize ${
                      data.user.role === r
                        ? `${ROLE_STYLES[r]} border-current/30`
                        : 'border-frame-border text-frame-textSecondary hover:text-white hover:border-frame-borderLight'
                    } disabled:opacity-70`}
                  >
                    {r === 'admin' && <Shield className="w-3 h-3 inline mr-1" />}
                    {r}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-frame-textMuted">
                <strong>Admin</strong>: full control. <strong>Manager</strong>: create review links, delete.{' '}
                <strong>Editor</strong>: upload, comment. <strong>Viewer</strong>: read + comment only.
              </p>
            </div>

            {/* Stats */}
            <div className="px-5 py-4 border-b border-frame-border">
              <h3 className="text-xs font-semibold text-frame-textMuted uppercase tracking-wider mb-2">Activity</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-frame-card rounded-lg px-3 py-2.5 flex items-center gap-2">
                  <Upload className="w-3.5 h-3.5 text-frame-textMuted" />
                  <div>
                    <p className="text-lg font-semibold text-white leading-none">{data.stats.assetsUploaded}</p>
                    <p className="text-[10px] text-frame-textMuted mt-0.5">Assets uploaded</p>
                  </div>
                </div>
                <div className="bg-frame-card rounded-lg px-3 py-2.5 flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-frame-textMuted" />
                  <div>
                    <p className="text-lg font-semibold text-white leading-none">{data.stats.commentsAuthored}</p>
                    <p className="text-[10px] text-frame-textMuted mt-0.5">Comments</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Owned projects */}
            <div className="px-5 py-4 border-b border-frame-border">
              <h3 className="text-xs font-semibold text-frame-textMuted uppercase tracking-wider mb-2">
                Owns {data.ownedProjects.length} project{data.ownedProjects.length !== 1 ? 's' : ''}
              </h3>
              {data.ownedProjects.length === 0 ? (
                <p className="text-xs text-frame-textMuted">Not an owner of any project.</p>
              ) : (
                <div className="space-y-1">
                  {data.ownedProjects.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-frame-cardHover text-xs">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color ?? '#888' }} />
                      <span className="text-white truncate flex-1">{p.name}</span>
                      <span className="text-frame-textMuted text-[10px]">
                        {p.collaboratorCount ?? 0} collab{p.collaboratorCount === 1 ? '' : 's'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Collaborating */}
            <div className="px-5 py-4 border-b border-frame-border">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-frame-textMuted uppercase tracking-wider">
                  Collaborates on {data.collaboratingProjects.length}
                </h3>
                <button
                  onClick={() => setShowProjectPicker(true)}
                  className="text-xs text-frame-accent hover:text-frame-accentHover font-medium flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add project
                </button>
              </div>
              {data.collaboratingProjects.length === 0 ? (
                <p className="text-xs text-frame-textMuted">Not a collaborator on any project.</p>
              ) : (
                <div className="space-y-1">
                  {data.collaboratingProjects.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-frame-cardHover group text-xs">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color ?? '#888' }} />
                      <span className="text-white truncate flex-1">{p.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ROLE_STYLES[p.role ?? 'viewer']}`}>
                        {p.role ?? 'viewer'}
                      </span>
                      <button
                        onClick={() => removeFromProject(p.id)}
                        disabled={saving}
                        title="Remove from project"
                        className="opacity-0 group-hover:opacity-100 text-frame-textMuted hover:text-red-400 p-0.5 transition-all disabled:opacity-50"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Danger / status */}
            <div className="px-5 py-4 space-y-2">
              <h3 className="text-xs font-semibold text-frame-textMuted uppercase tracking-wider">Account status</h3>
              <button
                onClick={toggleSuspended}
                disabled={saving}
                className={`w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                  data.user.disabled
                    ? 'text-emerald-400 border-emerald-400/30 hover:bg-emerald-400/10'
                    : 'text-yellow-400 border-yellow-400/30 hover:bg-yellow-400/10'
                }`}
              >
                {data.user.disabled ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                {data.user.disabled ? 'Reactivate account' : 'Suspend account'}
              </button>
              <p className="text-[11px] text-frame-textMuted">
                {data.user.disabled
                  ? 'Account is suspended. The user cannot log in or use the app.'
                  : 'Suspending blocks the user from logging in. Projects and comments are preserved.'}
              </p>
            </div>
          </div>
        )}

        {/* Project picker (add collaborator) */}
        {showProjectPicker && data && (
          <ProjectPicker
            userId={userId}
            existingProjectIds={new Set([
              ...data.ownedProjects.map((p) => p.id),
              ...data.collaboratingProjects.map((p) => p.id),
            ])}
            onClose={() => setShowProjectPicker(false)}
            onAdded={() => { setShowProjectPicker(false); load(); onChanged(); }}
            getIdToken={getIdToken}
          />
        )}
      </div>
    </div>
  );
}

function ProjectPicker({
  userId, existingProjectIds, onClose, onAdded, getIdToken,
}: {
  userId: string;
  existingProjectIds: Set<string>;
  onClose: () => void;
  onAdded: () => void;
  getIdToken: () => Promise<string | null>;
}) {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<ProjectRole>('editor');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch('/api/admin/projects', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const d = await res.json();
          setProjects(d.projects ?? []);
        }
      } catch { /* non-fatal */ }
      finally { setLoading(false); }
    })();
  }, [getIdToken]);

  const addToProject = async (projectId: string) => {
    setSaving(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/admin/users/${userId}/project-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ projectId, role }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error || 'Failed');
      }
      toast.success('Added to project');
      onAdded();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const filtered = projects.filter(
    (p) => !existingProjectIds.has(p.id) && p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="absolute inset-0 bg-frame-sidebar flex flex-col z-10">
      <div className="flex items-center justify-between px-5 py-4 border-b border-frame-border">
        <h3 className="text-sm font-semibold text-white">Add to project</h3>
        <button onClick={onClose} className="text-frame-textMuted hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-5 py-3 border-b border-frame-border space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-frame-textMuted" />
          <input
            autoFocus
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-frame-bg border border-frame-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-frame-textMuted focus:outline-none focus:border-frame-accent"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-frame-textMuted">Role:</span>
          {(['viewer', 'editor', 'manager'] as ProjectRole[]).map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`px-2 py-0.5 text-xs rounded capitalize ${
                role === r ? `${ROLE_STYLES[r]} border border-current/30` : 'text-frame-textSecondary hover:text-white'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <div className="flex justify-center py-8"><Spinner size="sm" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-frame-textMuted text-center py-8">
            {search ? 'No matches.' : 'User already has access to every project.'}
          </p>
        ) : (
          filtered.map((p) => (
            <button
              key={p.id}
              disabled={saving}
              onClick={() => addToProject(p.id)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-frame-cardHover transition-colors text-left disabled:opacity-50"
            >
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color ?? '#888' }} />
              <span className="text-sm text-white truncate flex-1">{p.name}</span>
              <span className="text-[10px] text-frame-textMuted">{p.ownerName}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
