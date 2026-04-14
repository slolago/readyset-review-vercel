'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { UserTable } from '@/components/admin/UserTable';
import { ProjectsTable } from '@/components/admin/ProjectsTable';
import { CreateUserModal } from '@/components/admin/CreateUserModal';
import type { User } from '@/types';
import { Shield, UserPlus, Users, FolderOpen, LayoutGrid } from 'lucide-react';
import { SafeZonesManager } from '@/components/admin/SafeZonesManager';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

export default function AdminPage() {
  const { user, getIdToken } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'projects' | 'safezones'>('users');
  const [projects, setProjects] = useState<any[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/dashboard');
  }, [user, router]);

  const fetchUsers = useCallback(async () => {
    try {
      const token = await getIdToken();
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
      }
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  const fetchProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/admin/projects', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects);
      }
    } catch {
      toast.error('Failed to load projects');
    } finally {
      setProjectsLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    if (user?.role === 'admin') fetchUsers();
  }, [user, fetchUsers]);

  useEffect(() => {
    if (activeTab === 'projects' && projects.length === 0 && !projectsLoading) {
      fetchProjects();
    }
  }, [activeTab, projects.length, projectsLoading, fetchProjects]);

  const handleRoleChange = async (userId: string, role: 'admin' | 'manager' | 'editor' | 'viewer') => {
    try {
      const token = await getIdToken();
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, role }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to update role'); return; }
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
      toast.success(`Role updated to ${role}`);
    } catch {
      toast.error('Failed to update role');
    }
  };

  const handleDelete = async (userId: string) => {
    try {
      const token = await getIdToken();
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to delete user'); return; }
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      toast.success('User deleted');
    } catch {
      toast.error('Failed to delete user');
    }
  };

  const handleCreated = (newUser: User) => {
    setUsers((prev) => [newUser, ...prev]);
    setShowCreate(false);
    toast.success('User created successfully');
  };

  if (!user || user.role !== 'admin') return null;

  const adminCount = users.filter((u) => u.role === 'admin').length;
  const managerCount = users.filter((u) => u.role === 'manager').length;
  const editorCount = users.filter((u) => u.role === 'editor').length;
  const viewerCount = users.filter((u) => u.role === 'viewer').length;

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-frame-border bg-frame-sidebar">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(122,0,223,0.12)_0%,transparent_60%)]" />
        <div className="relative px-8 py-6 max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-frame-accent/10 border border-frame-accent/20 text-frame-accent rounded-xl flex items-center justify-center">
              <Shield className="w-4.5 h-4.5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Admin Panel</h1>
              <p className="text-frame-textSecondary text-sm">Manage users, roles, and projects</p>
            </div>
          </div>
          <Button onClick={() => setShowCreate(true)} icon={<UserPlus className="w-4 h-4" />}>
            Invite user
          </Button>
        </div>
      </div>
      <div className="p-8 max-w-5xl mx-auto">

      {/* Stats — only shown on Users tab */}
      {activeTab === 'users' && !loading && (
        <div className="grid grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Total users', value: users.length, icon: Users },
            { label: 'Admins', value: adminCount, icon: Shield },
            { label: 'Managers', value: managerCount, icon: Users },
            { label: 'Editors', value: editorCount, icon: Users },
            { label: 'Viewers', value: viewerCount, icon: Users },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-frame-card border border-frame-border rounded-xl px-5 py-4 flex items-center gap-4">
              <div className="w-9 h-9 bg-frame-accent/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-frame-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{value}</p>
                <p className="text-xs text-frame-textMuted">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-frame-border mb-6">
        {([
          { key: 'users' as const, label: 'Users', icon: Users },
          { key: 'projects' as const, label: 'All Projects', icon: FolderOpen },
          { key: 'safezones' as const, label: 'Safe Zones', icon: LayoutGrid },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === key
                ? 'border-frame-accent text-white'
                : 'border-transparent text-frame-textSecondary hover:text-white'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'users' && (
        <div className="bg-frame-card border border-frame-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-frame-border flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-white">Users</h2>
              {!loading && (
                <p className="text-frame-textSecondary text-xs mt-0.5">
                  {users.length} {users.length === 1 ? 'user' : 'users'} registered
                </p>
              )}
            </div>
          </div>
          <UserTable
            users={users}
            loading={loading}
            onRoleChange={handleRoleChange}
            onDelete={handleDelete}
          />
        </div>
      )}

      {activeTab === 'projects' && (
        <div className="bg-frame-card border border-frame-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-frame-border">
            <h2 className="font-semibold text-white">All Projects</h2>
            {!projectsLoading && (
              <p className="text-frame-textSecondary text-xs mt-0.5">
                {projects.length} {projects.length === 1 ? 'project' : 'projects'} in the system
              </p>
            )}
          </div>
          <ProjectsTable projects={projects} loading={projectsLoading} />
        </div>
      )}

      {activeTab === 'safezones' && (
        <div className="bg-frame-card border border-frame-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-frame-border">
            <h2 className="font-semibold text-white">Safe Zones</h2>
            <p className="text-frame-textSecondary text-xs mt-0.5">
              Manage overlay images shown in the video player
            </p>
          </div>
          <div className="p-6">
            <SafeZonesManager getIdToken={getIdToken} />
          </div>
        </div>
      )}

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
          getIdToken={getIdToken}
        />
      )}
    </div>
    </div>
  );
}
