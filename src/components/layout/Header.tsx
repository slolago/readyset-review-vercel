'use client';

import { usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Avatar } from '@/components/ui/Avatar';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/projects': 'Projects',
  '/admin': 'Admin',
};

function getTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  if (pathname.startsWith('/projects/') && pathname.includes('/assets/')) return 'Asset Viewer';
  if (pathname.startsWith('/projects/') && pathname.includes('/folders/')) return 'Folder';
  if (pathname.startsWith('/projects/')) return 'Project';
  return 'Frame';
}

export function Header() {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <header className="h-14 border-b border-frame-border bg-frame-sidebar/50 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between px-6">
      <h1 className="text-sm font-semibold text-white">{getTitle(pathname)}</h1>

      <div className="flex items-center gap-3">
        <button className="w-8 h-8 flex items-center justify-center text-frame-textMuted hover:text-white rounded-lg hover:bg-frame-cardHover transition-colors">
          <Bell className="w-4 h-4" />
        </button>
        <Avatar src={user?.avatar} name={user?.name || 'User'} size="sm" />
      </div>
    </header>
  );
}
