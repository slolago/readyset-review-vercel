'use client';

import { useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { formatRelativeTime } from '@/lib/utils';
import type { User } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { Shield, Trash2, ChevronDown } from 'lucide-react';

interface UserTableProps {
  users: User[];
  loading: boolean;
  onRoleChange: (userId: string, role: 'admin' | 'manager' | 'editor' | 'viewer') => Promise<void>;
  onDelete: (userId: string) => Promise<void>;
}

const ROLE_STYLES: Record<string, string> = {
  admin: 'bg-frame-accent/15 text-frame-accent',
  manager: 'bg-purple-500/15 text-purple-400',
  editor: 'bg-blue-500/15 text-blue-400',
  viewer: 'bg-white/5 text-frame-textSecondary',
};

function RoleBadge({ role }: { role: 'admin' | 'manager' | 'editor' | 'viewer' }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_STYLES[role]}`}>
      {role === 'admin' && <Shield className="w-3 h-3" />}
      {role}
    </span>
  );
}

function UserRow({
  u,
  isSelf,
  onRoleChange,
  onDelete,
}: {
  u: User;
  isSelf: boolean;
  onRoleChange: (userId: string, role: 'admin' | 'manager' | 'editor' | 'viewer') => Promise<void>;
  onDelete: (userId: string) => Promise<void>;
}) {
  const [roleLoading, setRoleLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const createdAt = (u.createdAt as any)?.toDate?.() ?? new Date();

  const handleRoleChange = async (role: 'admin' | 'manager' | 'editor' | 'viewer') => {
    setRoleLoading(true);
    await onRoleChange(u.id, role);
    setRoleLoading(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleteLoading(true);
    await onDelete(u.id);
    setDeleteLoading(false);
    setConfirmDelete(false);
  };

  return (
    <tr className="border-b border-frame-border/50 hover:bg-white/[0.02] transition-colors group">
      {/* User */}
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <Avatar src={u.avatar} name={u.name} size="sm" />
          <div>
            <p className="text-sm font-medium text-white flex items-center gap-2 flex-wrap">
              {u.name}
              {isSelf && (
                <span className="text-[10px] bg-frame-accent/15 text-frame-accent px-1.5 py-0.5 rounded-full font-normal">
                  You
                </span>
              )}
              {u.invited && (
                <span className="text-[10px] bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 px-1.5 py-0.5 rounded-full font-normal">
                  Pending
                </span>
              )}
            </p>
            <p className="text-xs text-frame-textMuted">{u.email}</p>
          </div>
        </div>
      </td>

      {/* Role */}
      <td className="px-6 py-4">
        {isSelf ? (
          <RoleBadge role={u.role} />
        ) : (
          <div className="relative inline-flex items-center">
            <select
              value={u.role}
              onChange={(e) => handleRoleChange(e.target.value as 'admin' | 'manager' | 'editor' | 'viewer')}
              disabled={roleLoading}
              className={`appearance-none pl-2 pr-7 py-1 rounded-lg text-xs font-medium border transition-colors focus:outline-none focus:border-frame-accent cursor-pointer disabled:opacity-50 ${ROLE_STYLES[u.role]} border-current/30`}
            >
              <option value="viewer" className="bg-frame-bg text-white">Viewer</option>
              <option value="editor" className="bg-frame-bg text-white">Editor</option>
              <option value="manager" className="bg-frame-bg text-white">Manager</option>
              <option value="admin" className="bg-frame-bg text-white">Admin</option>
            </select>
            {roleLoading
              ? <Spinner size="sm" className="absolute right-1.5 top-1/2 -translate-y-1/2" />
              : <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-frame-textMuted" />
            }
          </div>
        )}
      </td>

      {/* Joined */}
      <td className="px-6 py-4">
        <span className="text-sm text-frame-textSecondary">{formatRelativeTime(createdAt)}</span>
      </td>

      {/* Actions */}
      <td className="px-6 py-4">
        {!isSelf && (
          confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-frame-textSecondary">Sure?</span>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors disabled:opacity-50"
              >
                {deleteLoading ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-frame-textMuted hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={handleDelete}
              className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 text-xs text-frame-textMuted hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          )
        )}
      </td>
    </tr>
  );
}

export function UserTable({ users, loading, onRoleChange, onDelete }: UserTableProps) {
  const { user: currentUser } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="py-16 text-center text-frame-textSecondary text-sm">
        No users found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-frame-border">
            <th className="text-left px-6 py-3 text-xs font-semibold text-frame-textMuted uppercase tracking-wider w-1/2">User</th>
            <th className="text-left px-6 py-3 text-xs font-semibold text-frame-textMuted uppercase tracking-wider">Role</th>
            <th className="text-left px-6 py-3 text-xs font-semibold text-frame-textMuted uppercase tracking-wider">Joined</th>
            <th className="px-6 py-3" />
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <UserRow
              key={u.id}
              u={u}
              isSelf={u.id === currentUser?.id}
              onRoleChange={onRoleChange}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
