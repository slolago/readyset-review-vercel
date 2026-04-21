'use client';

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { cn } from '@/lib/utils';

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  dividerBefore?: boolean;
  disabled?: boolean;
  danger?: boolean;
}

interface ContextMenuProps {
  items: MenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: position.x, top: position.y });
  const [measured, setMeasured] = useState(false);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleScroll = () => onClose();

    // Defer listener registration to next tick so the opening mousedown
    // (which triggered this render) does not immediately fire onClose.
    const timerId = setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown);
      document.addEventListener('keydown', handleKeyDown);
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('blur', onClose);
    }, 0);

    return () => {
      clearTimeout(timerId);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const pad = 8;
    let left = position.x;
    let top = position.y;
    if (left + rect.width + pad > window.innerWidth) left = position.x - rect.width;
    if (top + rect.height + pad > window.innerHeight) top = position.y - rect.height;
    left = Math.max(pad, Math.min(left, window.innerWidth - rect.width - pad));
    top = Math.max(pad, Math.min(top, window.innerHeight - rect.height - pad));
    setPos({ left, top });
    setMeasured(true);
  }, [position.x, position.y, items.length]);

  const menu = (
    <div
      ref={ref}
      style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 9999, visibility: measured ? 'visible' : 'hidden' }}
      className="bg-frame-card border border-frame-border rounded-xl shadow-2xl py-1 min-w-[160px] animate-fade-in"
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.dividerBefore && i > 0 && (
            <div className="my-1 border-t border-frame-border" />
          )}
          <button
            disabled={item.disabled}
            onClick={() => { item.onClick(); onClose(); }}
            className={cn(
              'w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors text-left',
              item.danger
                ? 'text-red-400 hover:bg-red-500/10'
                : 'text-frame-textSecondary hover:text-white hover:bg-frame-cardHover',
              item.disabled && 'opacity-40 cursor-not-allowed'
            )}
          >
            {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );

  return ReactDOM.createPortal(menu, document.body);
}

interface ContextMenuController {
  openKey: string | null;
  open: (key: string, position: { x: number; y: number }, items: MenuItem[]) => void;
  close: () => void;
}

const Ctx = createContext<ContextMenuController | null>(null);

export function ContextMenuProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ key: string; position: { x: number; y: number }; items: MenuItem[] } | null>(null);

  const open = useCallback((key: string, position: { x: number; y: number }, items: MenuItem[]) => {
    setState({ key, position, items });
  }, []);

  const close = useCallback(() => setState(null), []);

  const value: ContextMenuController = {
    openKey: state?.key ?? null,
    open,
    close,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {state && <ContextMenu position={state.position} items={state.items} onClose={() => setState(null)} />}
    </Ctx.Provider>
  );
}

export function useContextMenuController(): ContextMenuController {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useContextMenuController must be used inside ContextMenuProvider');
  return ctx;
}
