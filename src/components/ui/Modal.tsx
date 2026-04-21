'use client';

import React, { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  /**
   * Suppresses the brand gradient accent line at the top of the card.
   * Pass `true` for confirm / destructive dialogs where the colored line
   * reads as an error banner.
   */
  hideTopAccent?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  className,
  hideTopAccent = false,
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={cn(
          'relative w-full bg-frame-card border border-frame-border rounded-2xl shadow-2xl shadow-black/50 animate-slide-up overflow-hidden',
          sizes[size],
          className
        )}
      >
        {/* Subtle gradient top accent */}
        {!hideTopAccent && (
          <div className="absolute top-0 left-0 right-0 h-px bg-rs-gradient rounded-t-2xl opacity-60" />
        )}

        {title ? (
          <div className="flex items-center justify-between px-6 py-4 border-b border-frame-border">
            <h2 className="text-base font-semibold text-white">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-frame-textMuted hover:text-white transition-colors p-1.5 rounded-lg hover:bg-frame-cardHover"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          // No title — always render an absolutely-positioned close button
          // so users can dismiss without relying on ESC or backdrop click
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 z-10 text-frame-textMuted hover:text-white transition-colors p-1.5 rounded-lg hover:bg-frame-cardHover"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
