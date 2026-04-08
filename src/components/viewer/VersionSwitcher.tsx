'use client';

import { useState, useRef, useEffect } from 'react';
import { Layers, GitCompare, ChevronDown, Check } from 'lucide-react';
import type { Asset } from '@/types';

interface VersionSwitcherProps {
  versions: Asset[];
  activeVersionId: string;
  onSelectVersion: (asset: Asset) => void;
  compareMode: boolean;
  onToggleCompare: () => void;
}

export function VersionSwitcher({
  versions,
  activeVersionId,
  onSelectVersion,
  compareMode,
  onToggleCompare,
}: VersionSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = versions.find((v) => v.id === activeVersionId) ?? versions[versions.length - 1];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (versions.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      {/* Dropdown */}
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-frame-card border rounded-lg text-xs font-medium transition-colors ${
            compareMode
              ? 'border-frame-border text-frame-textSecondary'
              : 'border-frame-border text-white hover:border-frame-borderLight'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-frame-textMuted" />
          <span>V{active?.version}</span>
          <ChevronDown className={`w-3 h-3 text-frame-textMuted transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 bg-frame-card border border-frame-border rounded-lg shadow-xl overflow-hidden z-50 min-w-[180px]">
            {versions.map((v) => (
              <button
                key={v.id}
                onClick={() => { onSelectVersion(v); setOpen(false); }}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-frame-cardHover transition-colors ${
                  v.id === activeVersionId && !compareMode ? 'text-frame-accent font-semibold' : 'text-white'
                }`}
              >
                <span className="truncate">V{v.version} — {v.name}</span>
                {v.id === activeVersionId && !compareMode && (
                  <Check className="w-3.5 h-3.5 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Compare button */}
      <button
        onClick={onToggleCompare}
        title="Compare versions"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
          compareMode
            ? 'bg-frame-accent/15 border-frame-accent text-frame-accent'
            : 'border-frame-border text-frame-textSecondary hover:text-white hover:border-frame-borderLight'
        }`}
      >
        <GitCompare className="w-3.5 h-3.5" />
        Compare
      </button>
    </div>
  );
}
