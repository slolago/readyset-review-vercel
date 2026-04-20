'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FolderOpen, MoreHorizontal, Trash2, Edit, Users } from 'lucide-react';
import { Dropdown } from '@/components/ui/Dropdown';
import { formatRelativeTime, getProjectColor } from '@/lib/utils';
import type { Project } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { selectionStyle } from '@/lib/selectionStyle';
import toast from 'react-hot-toast';
import { RenameProjectModal } from './RenameProjectModal';

interface ProjectCardProps {
  project: Project;
  onDeleted?: () => void;
}

export function ProjectCard({ project, onDeleted }: ProjectCardProps) {
  const { user, getIdToken } = useAuth();
  const color = getProjectColor(project.color);
  const isOwner = project.ownerId === user?.id;
  const canRename = isOwner || user?.role === 'admin';
  const updatedAt = project.updatedAt?.toDate?.() || new Date();
  const [renaming, setRenaming] = useState(false);

  const handleDelete = async () => {
    // Require typing the project name to delete — it's a destructive action
    // that cascades to all folders, assets, comments, and review links
    const confirmText = prompt(
      `This will permanently delete "${project.name}" and ALL its folders, assets, comments, and review links.\n\nType the project name to confirm:`
    );
    if (confirmText !== project.name) {
      if (confirmText !== null) toast.error('Name did not match — nothing was deleted');
      return;
    }
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success(`Deleted "${project.name}"`);
        onDeleted?.();
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ? `Delete failed: ${data.error}` : 'Failed to delete project');
      }
    } catch (err) {
      toast.error(`Failed to delete: ${(err as Error).message || 'network error'}`);
    }
  };

  const menuItems = [
    ...(canRename
      ? [{ label: 'Rename', icon: <Edit className="w-4 h-4" />, onClick: () => setRenaming(true) }]
      : []),
    ...(isOwner
      ? [{ label: 'Delete', icon: <Trash2 className="w-4 h-4" />, onClick: handleDelete, danger: true }]
      : []),
  ];

  return (
    <div className={`group bg-frame-card rounded-xl overflow-hidden transition-all hover:bg-frame-cardHover ${selectionStyle('project', 'idle')}`}>
      {/* Color bar */}
      <div className="h-1" style={{ backgroundColor: color }} />

      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <Link href={`/projects/${project.id}`} className="flex items-center gap-3 flex-1 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: color + '20', color }}
            >
              <FolderOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-white truncate group-hover:text-frame-accent transition-colors">
                {project.name}
              </h3>
              {project.description && (
                <p className="text-frame-textMuted text-xs mt-0.5 truncate">
                  {project.description}
                </p>
              )}
            </div>
          </Link>

          {menuItems.length > 0 && (
            <Dropdown
              trigger={
                <button className="w-7 h-7 flex items-center justify-center rounded-lg text-frame-textMuted hover:text-white hover:bg-frame-border transition-colors opacity-0 group-hover:opacity-100">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              }
              items={menuItems}
            />
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-frame-textMuted text-xs">
            <Users className="w-3.5 h-3.5" />
            <span>{project.collaborators?.length || 1} member{project.collaborators?.length !== 1 ? 's' : ''}</span>
          </div>
          <span className="text-frame-textMuted text-xs">{formatRelativeTime(updatedAt)}</span>
        </div>
      </div>

      {renaming && (
        <RenameProjectModal
          project={project}
          onClose={() => setRenaming(false)}
          onRenamed={() => {
            setRenaming(false);
            // Reuse onDeleted — parent uses it as a generic 'refetch' trigger
            onDeleted?.();
          }}
        />
      )}
    </div>
  );
}
