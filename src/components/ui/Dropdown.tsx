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
  const [flipUp, setFlipUp] = useState(false);
  const [panelHeight, setPanelHeight] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const wasOpenRef = useRef(false);

  // Compute trigger position when opening + reset active index
  useEffect(() => {
    if (open && triggerRef.current) {
      setRect(triggerRef.current.getBoundingClientRect());
      setActiveIndex(0);
      // Reset measured height so the next open re-measures against the
      // current viewport (the menu's content might have changed).
      setPanelHeight(null);
      setFlipUp(false);
    } else if (!open) {
      setActiveIndex(-1);
    }
  }, [open]);

  // Measure the panel once it's in the DOM, then decide whether to flip.
  // The panel is initially rendered invisibly below the trigger; if it
  // would overflow the viewport bottom AND flipping up gives more room,
  // we swap to `bottom: viewport - rect.top` anchoring. Measures against
  // the actual content — avoids hardcoded item-count heuristics.
  useEffect(() => {
    if (!open || !rect || !panelRef.current) return;
    const measured = panelRef.current.getBoundingClientRect().height;
    setPanelHeight(measured);

    const spaceBelow = window.innerHeight - rect.bottom - 6;
    const spaceAbove = rect.top - 6;
    // Flip only when the menu actually overflows below AND there's more
    // room above — avoids flipping up when the menu fits fine both ways.
    if (measured > spaceBelow && spaceAbove > spaceBelow) {
      setFlipUp(true);
    }
  }, [open, rect, items.length]);

  // Focus active item when it changes (roving tabindex)
  useEffect(() => {
    if (open && activeIndex >= 0) {
      itemRefs.current[activeIndex]?.focus();
    }
  }, [open, activeIndex]);

  // Return focus to trigger when closing (but not on initial mount)
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      return;
    }
    if (wasOpenRef.current) {
      triggerRef.current?.focus();
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

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const handlePanelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (items.length === 0) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % items.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + items.length) % items.length);
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(items.length - 1);
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < items.length) {
          items[activeIndex].onClick();
          setOpen(false);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      default:
        break;
    }
  };

  const panel =
    open && rect && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={panelRef}
            role="menu"
            onKeyDown={handlePanelKeyDown}
            style={{
              position: 'fixed',
              // Flip-up anchors at the BOTTOM edge so long menus grow
              // upward from the trigger — viewport-bottom overflow fixed.
              // Before measurement (first paint) we render at the default
              // below position but invisible, so the flip decision can
              // happen before the user sees anything.
              ...(flipUp
                ? { bottom: window.innerHeight - rect.top + 6 }
                : { top: rect.bottom + 6 }),
              ...(align === 'right'
                ? { right: window.innerWidth - rect.right }
                : { left: rect.left }),
              // Cap height if the menu still can't fit (narrow viewport)
              // so the menu becomes scrollable instead of clipped.
              maxHeight: `${Math.max(120, window.innerHeight - 24)}px`,
              overflowY: 'auto',
              zIndex: 9999,
              // Hide until we've measured + decided on flip direction to
              // avoid a visible jump on the first paint.
              visibility: panelHeight === null ? 'hidden' : 'visible',
            }}
            className="bg-frame-card border border-frame-border rounded-xl shadow-2xl py-1 min-w-[160px] animate-fade-in"
          >
            {items.map((item, i) => (
              <React.Fragment key={i}>
                {item.divider && i > 0 && (
                  <div className="my-1 border-t border-frame-border" />
                )}
                <button
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => {
                    item.onClick();
                    setOpen(false);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors text-left outline-none',
                    item.danger
                      ? 'text-red-400 hover:bg-red-500/10 focus:bg-red-500/10'
                      : 'text-frame-textSecondary hover:text-white hover:bg-frame-cardHover focus:text-white focus:bg-frame-cardHover'
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
      <button
        type="button"
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn('relative inline-block', className)}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleTriggerKeyDown}
      >
        {trigger}
      </button>
      {panel}
    </>
  );
}
