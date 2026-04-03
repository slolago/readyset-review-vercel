'use client';

import { cn } from '@/lib/utils';
import type { AnnotationTool, AnnotationColor } from '@/types';
import {
  MousePointer2,
  Square,
  Circle,
  MoveRight,
  Pen,
  Type,
  Undo2,
} from 'lucide-react';

interface AnnotationToolbarProps {
  tool: AnnotationTool;
  color: AnnotationColor;
  onToolChange: (tool: AnnotationTool) => void;
  onColorChange: (color: AnnotationColor) => void;
  onUndo: () => void;
  onClear: () => void;
}

const TOOLS: { id: AnnotationTool; icon: React.ReactNode; label: string }[] = [
  { id: 'select', icon: <MousePointer2 className="w-4 h-4" />, label: 'Select' },
  { id: 'rectangle', icon: <Square className="w-4 h-4" />, label: 'Rectangle' },
  { id: 'circle', icon: <Circle className="w-4 h-4" />, label: 'Circle' },
  { id: 'arrow', icon: <MoveRight className="w-4 h-4" />, label: 'Arrow' },
  { id: 'freehand', icon: <Pen className="w-4 h-4" />, label: 'Draw' },
  { id: 'text', icon: <Type className="w-4 h-4" />, label: 'Text' },
];

const COLORS: { id: AnnotationColor; hex: string }[] = [
  { id: 'red', hex: '#ff3333' },
  { id: 'yellow', hex: '#ffdd00' },
  { id: 'blue', hex: '#3399ff' },
  { id: 'green', hex: '#00cc66' },
  { id: 'white', hex: '#ffffff' },
];

export function AnnotationToolbar({
  tool,
  color,
  onToolChange,
  onColorChange,
  onUndo,
  onClear,
}: AnnotationToolbarProps) {
  return (
    <div className="flex items-center gap-1 bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10">
      {/* Tools */}
      <div className="flex items-center gap-0.5">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            title={t.label}
            onClick={() => onToolChange(t.id)}
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center transition-all',
              tool === t.id
                ? 'bg-frame-accent text-white'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            )}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-white/20 mx-1" />

      {/* Colors */}
      <div className="flex items-center gap-1">
        {COLORS.map((c) => (
          <button
            key={c.id}
            title={c.id}
            onClick={() => onColorChange(c.id)}
            style={{ backgroundColor: c.hex }}
            className={cn(
              'w-5 h-5 rounded-full transition-all hover:scale-110',
              color === c.id && 'ring-2 ring-white ring-offset-1 ring-offset-transparent scale-110'
            )}
          />
        ))}
      </div>

      <div className="w-px h-5 bg-white/20 mx-1" />

      <button
        onClick={onUndo}
        title="Undo (Ctrl+Z)"
        className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all"
      >
        <Undo2 className="w-4 h-4" />
      </button>

      <button
        onClick={onClear}
        className="text-xs text-white/60 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/10"
      >
        Clear
      </button>
    </div>
  );
}
