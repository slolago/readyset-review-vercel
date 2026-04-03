'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FolderOpen,
  Shield,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/projects', icon: FolderOpen, label: 'Projects' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  return (
    <aside className="w-60 bg-frame-sidebar border-r border-frame-border flex flex-col h-screen sticky top-0 flex-shrink-0">
      {/* Logo */}
      <div className="px-5 py-4 flex items-center border-b border-frame-border h-16">
        <Image
          src="https://readyset.co/wp-content/uploads/2025/09/01.logo-horizontal.png"
          alt="Ready Set"
          width={130}
          height={36}
          className="object-contain"
          unoptimized
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto pt-4">
        <p className="text-xs font-semibold text-frame-textMuted uppercase tracking-wider px-3 mb-2">
          Navigation
        </p>
        {navItems.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
              isActive(href)
                ? 'bg-frame-accent/15 text-frame-accent border border-frame-accent/20'
                : 'text-frame-textSecondary hover:text-white hover:bg-frame-cardHover border border-transparent'
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
            {isActive(href) && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-frame-accent" />
            )}
          </Link>
        ))}

        {user?.role === 'admin' && (
          <Link
            href="/admin"
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
              isActive('/admin')
                ? 'bg-frame-accent/15 text-frame-accent border border-frame-accent/20'
                : 'text-frame-textSecondary hover:text-white hover:bg-frame-cardHover border border-transparent'
            )}
          >
            <Shield className="w-4 h-4 flex-shrink-0" />
            Admin
            {isActive('/admin') && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-frame-accent" />
            )}
          </Link>
        )}
      </nav>

      {/* Bottom gradient separator */}
      <div className="mx-3 h-px bg-gradient-to-r from-transparent via-frame-border to-transparent" />

      {/* User section */}
      <div className="p-3">
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-frame-cardHover transition-colors text-left border border-transparent hover:border-frame-border"
          >
            <Avatar src={user?.avatar} name={user?.name || 'User'} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.name}</p>
              <p className="text-xs text-frame-textMuted truncate">{user?.email}</p>
            </div>
            <ChevronDown className={cn('w-3.5 h-3.5 text-frame-textMuted flex-shrink-0 transition-transform', userMenuOpen && 'rotate-180')} />
          </button>

          {userMenuOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-frame-card border border-frame-border rounded-xl shadow-2xl py-1 z-50 fade-in">
              <div className="px-4 py-2.5 border-b border-frame-border mb-1">
                <p className="text-xs text-frame-textMuted">Signed in as</p>
                <p className="text-sm text-white font-medium truncate">{user?.email}</p>
              </div>
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  signOut();
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
