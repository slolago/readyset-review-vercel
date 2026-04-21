'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useProjects } from '@/hooks/useProject';
import { ProjectGrid } from '@/components/projects/ProjectGrid';
import { CreateProjectModal } from '@/components/projects/CreateProjectModal';
import { Button } from '@/components/ui/Button';
import { Plus, Search, X } from 'lucide-react';

export default function ProjectsPage() {
  const { projects, loading, refetch } = useProjects();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const actionHandledRef = useRef(false);

  // Open create modal from deep link (e.g., /projects?create=1)
  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setShowCreate(true);
      router.replace('/projects', { scroll: false });
    }
  }, [searchParams, router]);

  // Handle ?action=upload|invite — route into a real project context
  // (or prompt to create one first if no projects exist).
  useEffect(() => {
    if (actionHandledRef.current) return;
    const action = searchParams.get('action');
    if (action !== 'upload' && action !== 'invite') return;
    if (loading) return; // wait until we know whether projects exist
    actionHandledRef.current = true;

    if (projects.length === 0) {
      setShowCreate(true);
      toast(
        `Create a project first, then you can ${
          action === 'upload' ? 'upload assets' : 'invite collaborators'
        }.`
      );
      router.replace('/projects', { scroll: false });
    } else {
      router.replace(`/projects/${projects[0].id}?action=${action}`, { scroll: false });
    }
  }, [searchParams, loading, projects, router]);

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
            className={`w-full bg-frame-card border border-frame-border rounded-xl pl-9 py-2.5 text-sm text-white placeholder-frame-textMuted focus:outline-none focus:border-frame-accent transition-colors ${search ? 'pr-10' : 'pr-4'}`}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              title="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-frame-border text-frame-textMuted hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
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
