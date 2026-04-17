'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Compute trigger position when opening
  useEffect(() => {
    if (open && triggerRef.current) {
      setRect(triggerRef.current.getBoundingClientRect());
    }
  }, [open]);

  // Outside-click and scroll/resize handling
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger = triggerRef.current?.contains(target) ?? false;
      const insidePanel = panelRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insidePanel) {
        setOpen(false);
      }
    };
    const handleClose = () => setOpen(false);
    // Only close on scroll if it's happening OUTSIDE the dropdown itself.
    // Scrolling inside a long dropdown menu should not dismiss it.
    const handleScroll = (e: Event) => {
      const target = e.target as Node;
      const insidePanel = panelRef.current?.contains(target) ?? false;
      if (!insidePanel) setOpen(false);
    };

    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('scroll', handleScroll, { capture: true });
    window.addEventListener('resize', handleClose);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('scroll', handleScroll, { capture: true } as EventListenerOptions);
      window.removeEventListener('resize', handleClose);
    };
  }, []);

  const panel =
    open && rect && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              top: rect.bottom + 6,
              ...(align === 'right'
                ? { right: window.innerWidth - rect.right }
                : { left: rect.left }),
              zIndex: 9999,
            }}
            className="bg-frame-card border border-frame-border rounded-xl shadow-2xl py-1 min-w-[160px] animate-fade-in"
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
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div
        ref={triggerRef}
        className={cn('relative inline-block', className)}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </div>
      {panel}
    </>
  );
}
