'use client';

import { Spinner } from '@/components/ui/Spinner';
import { formatRelativeTime } from '@/lib/utils';

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
}

export function ProjectsTable({ projects, loading }: ProjectsTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="py-16 text-center text-frame-textSecondary text-sm">
        No projects found.
      </div>
    );
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
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => {
            const createdAt = project.createdAt?.toDate?.() ?? new Date();
            const descriptionSnippet = project.description
              ? project.description.slice(0, 40) + (project.description.length > 40 ? '…' : '')
              : '';

            return (
              <tr
                key={project.id}
                className="border-b border-frame-border/50 hover:bg-white/[0.02] transition-colors"
              >
                {/* Project */}
                <td className="px-6 py-4">
                  <div className="flex items-start gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: project.color }}
                    />
                    <div>
                      <p className="text-sm font-medium text-white">{project.name}</p>
                      {descriptionSnippet && (
                        <p className="text-xs text-frame-textMuted mt-0.5">{descriptionSnippet}</p>
                      )}
                    </div>
                  </div>
                </td>

                {/* Owner */}
                <td className="px-6 py-4">
                  <p className="text-sm text-white">{project.ownerName}</p>
                  <p className="text-xs text-frame-textMuted mt-0.5">{project.ownerEmail}</p>
                </td>

                {/* Collaborators */}
                <td className="px-6 py-4">
                  <span className="text-sm text-frame-textSecondary">{project.collaboratorCount}</span>
                </td>

                {/* Created */}
                <td className="px-6 py-4">
                  <span className="text-sm text-frame-textSecondary">{formatRelativeTime(createdAt)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
