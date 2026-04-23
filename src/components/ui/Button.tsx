'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from './Spinner';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconRight,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-frame-accent/50 disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-frame-accent hover:bg-frame-accentHover text-white shadow-lg shadow-frame-accent/20 hover:shadow-frame-accent/30',
    secondary: 'bg-frame-card hover:bg-frame-cardHover text-white border border-frame-border hover:border-frame-borderLight',
    ghost: 'text-frame-textSecondary hover:text-white hover:bg-frame-cardHover',
    danger: 'bg-red-600/90 hover:bg-red-500 text-white shadow-sm',
    outline: 'border border-frame-border text-frame-textSecondary hover:text-white hover:border-frame-borderLight hover:bg-frame-cardHover',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-sm',
  };

  // Default spinner inherits `border-frame-accent`, which is invisible
  // against a `bg-frame-accent` primary button — makes the loading state
  // look like the label is off-center (the text shifts right to make
  // room for the invisible spinner). Override per variant so the spinner
  // is always visible on its background.
  const spinnerClass =
    variant === 'primary' || variant === 'danger'
      ? 'border-white/90'
      : 'border-frame-accent';

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Spinner size="sm" className={spinnerClass} />
      ) : (
        icon && <span className="flex-shrink-0">{icon}</span>
      )}
      {children}
      {iconRight && <span className="flex-shrink-0">{iconRight}</span>}
    </button>
  );
}
