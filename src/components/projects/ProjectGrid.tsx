'use client';

import { ProjectCard } from './ProjectCard';
import { FolderOpen, Plus } from 'lucide-react';
import type { Project } from '@/types';

interface ProjectGridProps {
  projects: Project[];
  loading: boolean;
  onProjectCreated?: () => void;
  onCreateNew?: () => void;
}

export function ProjectGrid({
  projects,
  loading,
  onProjectCreated,
  onCreateNew,
}: ProjectGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="h-32 bg-frame-card rounded-xl animate-pulse border border-frame-border"
          />
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 bg-frame-card border border-frame-border rounded-2xl flex items-center justify-center mb-4">
          <FolderOpen className="w-8 h-8 text-frame-textMuted" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">No projects yet</h3>
        <p className="text-frame-textSecondary text-sm max-w-sm mb-6">
          Create your first project to start uploading and reviewing media with your team.
        </p>
        {onCreateNew && (
          <button
            onClick={onCreateNew}
            className="flex items-center gap-2 bg-frame-accent hover:bg-frame-accentHover text-white font-medium px-5 py-2.5 rounded-xl text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create first project
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          onDeleted={onProjectCreated}
        />
      ))}
    </div>
  );
}
