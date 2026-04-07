'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Link as LinkIcon } from 'lucide-react';
import { useProjectTree } from '@/hooks/useProjectTree';
import { cn } from '@/lib/utils';

export function ProjectTreeNav() {
  const { treeNodes, toggleProject } = useProjectTree();
  const pathname = usePathname();

  return (
    <div className="overflow-y-auto flex-1 px-1 pb-4">
      <p className="text-xs font-semibold text-frame-textMuted uppercase tracking-wider px-2 mb-1.5 mt-3">
        Projects
      </p>

      {treeNodes.map(({ project, folders, foldersLoaded, expanded }) => {
        const projectPath = `/projects/${project.id}`;
        const isProjectActive =
          pathname === projectPath || pathname.startsWith(`${projectPath}/`);

        return (
          <div key={project.id}>
            {/* Project row */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => toggleProject(project.id)}
                className="flex-shrink-0 p-0.5 rounded hover:bg-frame-accent/10 transition-colors"
                aria-label={expanded ? 'Collapse project' : 'Expand project'}
              >
                <ChevronRight
                  className={cn(
                    'w-3.5 h-3.5 text-frame-textMuted transition-transform duration-150',
                    expanded && 'rotate-90'
                  )}
                />
              </button>

              <Link
                href={projectPath}
                className={cn(
                  'flex-1 py-1.5 px-2 rounded text-sm truncate transition-colors hover:bg-frame-accent/10',
                  isProjectActive
                    ? 'text-frame-accent bg-frame-accent/10'
                    : 'text-frame-text'
                )}
              >
                {project.name}
              </Link>
            </div>

            {/* Folder rows */}
            {expanded && (
              <div>
                {!foldersLoaded ? (
                  // Loading spinner
                  <div
                    className="w-3 h-3 border border-frame-accent/40 border-t-frame-accent rounded-full animate-spin ml-6 my-1"
                    aria-label="Loading folders"
                  />
                ) : folders.length === 0 ? (
                  <span className="pl-6 text-xs text-frame-textMuted">
                    No folders
                  </span>
                ) : (
                  folders.map((folder) => {
                    const folderPath = `/projects/${project.id}/folders/${folder.id}`;
                    const isFolderActive = pathname === folderPath;

                    return (
                      <Link
                        key={folder.id}
                        href={folderPath}
                        className={cn(
                          'block pl-6 py-1 px-2 text-sm rounded truncate transition-colors hover:bg-frame-accent/10',
                          isFolderActive
                            ? 'text-frame-accent bg-frame-accent/10'
                            : 'text-frame-text'
                        )}
                      >
                        {folder.name}
                      </Link>
                    );
                  })
                )}
                {foldersLoaded && (
                  <Link
                    href={`/projects/${project.id}/review-links`}
                    className={cn(
                      'flex items-center gap-1.5 pl-6 py-1 px-2 text-sm rounded truncate transition-colors hover:bg-frame-accent/10',
                      pathname.startsWith(`/projects/${project.id}/review-links`)
                        ? 'text-frame-accent bg-frame-accent/10'
                        : 'text-frame-textMuted'
                    )}
                  >
                    <LinkIcon className="w-3 h-3 flex-shrink-0" />
                    Review Links
                  </Link>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
