'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('sidebar-open');
    return stored === null ? true : stored === 'true';
  });

  useEffect(() => {
    localStorage.setItem('sidebar-open', String(sidebarOpen));
  }, [sidebarOpen]);

  return (
    <div className="flex h-screen bg-frame-bg overflow-hidden">
      {/* Sidebar + toggle — a single flex column that shrinks but never disappears */}
      <div
        className={`relative flex-shrink-0 transition-all duration-200 border-r border-frame-border ${
          sidebarOpen ? 'w-60' : 'w-10'
        }`}
      >
        {/* Sidebar content — hidden when collapsed */}
        <div className={sidebarOpen ? 'block' : 'hidden'}>
          <Sidebar />
        </div>

        {/* Toggle button — lives inside the strip, never overlaps main content */}
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          className={`absolute top-3 z-10 w-7 h-7 flex items-center justify-center rounded-md text-frame-textMuted hover:text-white hover:bg-frame-cardHover transition-colors ${
            sidebarOpen ? 'right-1.5' : 'left-1.5'
          }`}
        >
          {sidebarOpen ? (
            <PanelLeftClose className="w-4 h-4" />
          ) : (
            <PanelLeftOpen className="w-4 h-4" />
          )}
        </button>
      </div>

      <main className="flex-1 overflow-y-auto min-w-0">
        {children}
      </main>
    </div>
  );
}
