'use client';

import { useState } from 'react';
import { useProjects } from '@/hooks/useProject';
import { ProjectGrid } from '@/components/projects/ProjectGrid';
import { CreateProjectModal } from '@/components/projects/CreateProjectModal';
import { Button } from '@/components/ui/Button';
import { Plus, Search } from 'lucide-react';

export default function ProjectsPage() {
  const { projects, loading, refetch } = useProjects();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-frame-border bg-frame-sidebar">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(122,0,223,0.12)_0%,transparent_60%)]" />
        <div className="relative px-8 py-6 max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">Projects</h1>
            <p className="text-frame-textSecondary text-sm mt-0.5">
              {projects.length} project{projects.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)} icon={<Plus className="w-4 h-4" />}>
            New Project
          </Button>
        </div>
      </div>

      <div className="p-8 max-w-7xl mx-auto">
        {/* Search */}
        <div className="relative mb-6 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-frame-textMuted" />
          <input
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-frame-card border border-frame-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-frame-textMuted focus:outline-none focus:border-frame-accent transition-colors"
          />
        </div>

        <ProjectGrid
          projects={filtered}
          loading={loading}
          onProjectCreated={refetch}
          onCreateNew={() => setShowCreate(true)}
        />

        {showCreate && (
          <CreateProjectModal
            onClose={() => setShowCreate(false)}
            onCreated={() => {
              refetch();
              setShowCreate(false);
            }}
          />
        )}
      </div>
    </div>
  );
}
