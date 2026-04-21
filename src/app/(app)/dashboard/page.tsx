'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useProjects } from '@/hooks/useProject';
import { Film, FolderOpen, HardDrive, Upload, Users, Clock, ArrowRight, Sparkles, Link as LinkIcon } from 'lucide-react';
import { formatRelativeTime, getProjectColor, formatBytes } from '@/lib/utils';
import type { Project } from '@/types';

interface DashboardStats {
  projectCount: number;
  assetCount: number;
  collaboratorCount: number;
  storageBytes: number;
  reviewLinkCount?: number;
}

export default function DashboardPage() {
  const { user, getIdToken } = useAuth();
  const { projects, loading } = useProjects();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    getIdToken().then((token) =>
      fetch('/api/stats', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => {
          setStats(data);
          setStatsLoading(false);
        })
        .catch(() => setStatsLoading(false))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getIdToken]);

  const recentProjects = projects.slice(0, 4);

  return (
    <div className="min-h-full">
      {/* Hero header */}
      <div className="relative overflow-hidden border-b border-frame-border bg-frame-sidebar">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(122,0,223,0.15)_0%,transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(6,147,227,0.08)_0%,transparent_60%)]" />
        <div className="relative px-8 py-8 max-w-6xl mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-frame-accent" />
            <span className="text-frame-accent text-xs font-semibold uppercase tracking-wider">Dashboard</span>
          </div>
          <h1 className="text-2xl font-bold text-white">
            Welcome back, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p className="text-frame-textSecondary mt-1 text-sm">
            Here&apos;s what&apos;s happening with your projects.
          </p>
        </div>
      </div>

      <div className="p-8 max-w-6xl mx-auto">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={<FolderOpen className="w-5 h-5" />}
            label="Projects"
            value={loading ? null : projects.length.toString()}
            color="purple"
          />
          <StatCard
            icon={<Film className="w-5 h-5" />}
            label="Assets"
            value={statsLoading ? null : (stats?.assetCount.toString() ?? '—')}
            color="blue"
          />
          <StatCard
            icon={<LinkIcon className="w-5 h-5" />}
            label="Review Links"
            value={statsLoading ? null : ((stats?.reviewLinkCount ?? 0).toString())}
            color="green"
            href="/review-links"
            tooltip="Share links across all your projects"
          />
          <StatCard
            icon={<HardDrive className="w-5 h-5" />}
            label="Storage"
            value={statsLoading ? null : (stats ? formatBytes(stats.storageBytes) : '—')}
            color="orange"
          />
        </div>

        {/* Recent Projects */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">Recent Projects</h2>
            <Link
              href="/projects"
              className="text-xs text-frame-accent hover:text-frame-accentHover flex items-center gap-1 transition-colors font-medium"
            >
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-24 bg-frame-card rounded-xl animate-pulse border border-frame-border"
                />
              ))}
            </div>
          ) : recentProjects.length === 0 ? (
            <div className="bg-frame-card border border-frame-border rounded-2xl p-10 text-center">
              <div className="w-14 h-14 bg-frame-accent/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <FolderOpen className="w-7 h-7 text-frame-accent" />
              </div>
              <p className="text-white font-semibold">No projects yet</p>
              <p className="text-frame-textMuted text-sm mt-1 mb-5">
                Create your first project to get started.
              </p>
              <Link
                href="/projects?create=1"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-frame-accent hover:bg-frame-accentHover text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-frame-accent/20"
              >
                Create project
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {recentProjects.map((project) => (
                <DashboardProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-base font-semibold text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <QuickAction
              href="/projects"
              icon={<FolderOpen className="w-5 h-5" />}
              label="Browse Projects"
              description="View and manage all your projects"
              gradient="from-violet-500/20 to-purple-500/10"
            />
            {/* TODO(VIS-08): wire ?action=upload and ?action=invite handlers
                on the projects list page in a follow-up plan. */}
            <QuickAction
              href="/projects?action=upload"
              icon={<Upload className="w-5 h-5" />}
              label="Upload Assets"
              description="Upload videos and images for review"
              gradient="from-blue-500/20 to-cyan-500/10"
            />
            <QuickAction
              href="/projects?action=invite"
              icon={<Users className="w-5 h-5" />}
              label="Invite Team"
              description="Collaborate with your team members"
              gradient="from-emerald-500/20 to-teal-500/10"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
  href,
  tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  color: string;
  href?: string;
  tooltip?: string;
}) {
  const colorMap: Record<string, { icon: string; glow: string }> = {
    purple: { icon: 'text-frame-accent bg-frame-accent/10', glow: 'shadow-frame-accent/10' },
    blue: { icon: 'text-blue-400 bg-blue-400/10', glow: 'shadow-blue-400/10' },
    green: { icon: 'text-frame-green bg-frame-green/10', glow: 'shadow-frame-green/10' },
    orange: { icon: 'text-orange-400 bg-orange-400/10', glow: 'shadow-orange-400/10' },
  };
  const c = colorMap[color];
  const inner = (
    <div className={`bg-frame-card border border-frame-border rounded-xl p-4 shadow-lg ${c.glow} ${href ? 'hover:border-frame-borderLight hover:bg-frame-cardHover transition-all cursor-pointer' : ''}`}
      title={tooltip}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${c.icon}`}>
        {icon}
      </div>
      {value === null ? (
        <div className="h-8 w-16 bg-frame-border rounded animate-pulse mb-1" />
      ) : (
        <div className="text-2xl font-bold text-white tracking-tight">{value}</div>
      )}
      <div className="text-frame-textSecondary text-xs font-medium mt-1">{label}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function DashboardProjectCard({ project }: { project: Project }) {
  const color = getProjectColor(project.color);
  const updatedAt = project.updatedAt?.toDate?.() || new Date();

  return (
    <Link href={`/projects/${project.id}`}>
      <div className="bg-frame-card border border-frame-border hover:border-frame-borderLight rounded-xl overflow-hidden cursor-pointer transition-all hover:bg-frame-cardHover group">
        {/* Color accent top bar */}
        <div className="h-0.5" style={{ background: `linear-gradient(to right, ${color}, transparent)` }} />
        <div className="p-4 flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center"
            style={{ backgroundColor: color + '20', color }}
          >
            <FolderOpen className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white truncate group-hover:text-frame-accent transition-colors text-sm">
              {project.name}
            </h3>
            {project.description && (
              <p className="text-frame-textMuted text-xs mt-0.5 truncate">
                {project.description}
              </p>
            )}
            <div className="flex items-center gap-1 mt-2 text-frame-textMuted text-xs">
              <Clock className="w-3 h-3" />
              <span>{formatRelativeTime(updatedAt)}</span>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-frame-textMuted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
        </div>
      </div>
    </Link>
  );
}

function QuickAction({
  href,
  icon,
  label,
  description,
  gradient,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  gradient: string;
}) {
  return (
    <Link href={href}>
      <div className="bg-frame-card border border-frame-border hover:border-frame-borderLight rounded-xl p-5 cursor-pointer transition-all hover:bg-frame-cardHover group relative overflow-hidden">
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-100 transition-opacity`} />
        <div className="relative">
          <div className="w-10 h-10 bg-frame-accent/10 text-frame-accent rounded-xl flex items-center justify-center mb-3 group-hover:bg-frame-accent/20 transition-colors">
            {icon}
          </div>
          <h3 className="font-semibold text-white text-sm">{label}</h3>
          <p className="text-frame-textMuted text-xs mt-1">{description}</p>
        </div>
      </div>
    </Link>
  );
}
