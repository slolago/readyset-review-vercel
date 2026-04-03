'use client';

import { Layers, GitCompare } from 'lucide-react';
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
  if (versions.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 bg-frame-card border border-frame-border rounded-lg p-1">
        <Layers className="w-3.5 h-3.5 text-frame-textMuted ml-1" />
        {versions.map((v) => (
          <button
            key={v.id}
            onClick={() => onSelectVersion(v)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              v.id === activeVersionId && !compareMode
                ? 'bg-frame-accent text-white'
                : 'text-frame-textSecondary hover:text-white hover:bg-white/10'
            }`}
          >
            V{v.version}
          </button>
        ))}
      </div>
      {versions.length >= 2 && (
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
      )}
    </div>
  );
}
