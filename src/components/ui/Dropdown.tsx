'use client';

import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface DropdownItem {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
  divider?: boolean;
}

interface DropdownProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: 'left' | 'right';
  className?: string;
}

export function Dropdown({ trigger, items, align = 'right', className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className={cn('relative inline-block', className)}>
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>

      {open && (
        <div
          className={cn(
            'absolute top-full mt-1.5 z-50 bg-frame-card border border-frame-border rounded-xl shadow-2xl py-1 min-w-[160px] animate-fade-in',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          {items.map((item, i) => (
            <React.Fragment key={i}>
              {item.divider && i > 0 && (
                <div className="my-1 border-t border-frame-border" />
              )}
              <button
                onClick={() => {
                  item.onClick();
                  setOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors text-left',
                  item.danger
                    ? 'text-red-400 hover:bg-red-500/10'
                    : 'text-frame-textSecondary hover:text-white hover:bg-frame-cardHover'
                )}
              >
                {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
                {item.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
