'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export function Input({
  label,
  error,
  icon,
  className,
  id,
  ...props
}: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-frame-textSecondary mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-frame-textMuted">
            {icon}
          </div>
        )}
        <input
          id={inputId}
          className={cn(
            'w-full bg-frame-bg border border-frame-border rounded-xl px-4 py-2.5 text-sm text-white placeholder-frame-textMuted',
            'focus:outline-none focus:border-frame-accent focus:ring-1 focus:ring-frame-accent/30 transition-all',
            error && 'border-red-500 focus:border-red-500',
            icon && 'pl-9',
            className
          )}
          {...props}
        />
      </div>
      {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className, id, ...props }: TextareaProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-frame-textSecondary mb-1.5"
        >
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        className={cn(
          'w-full bg-frame-bg border border-frame-border rounded-xl px-4 py-2.5 text-sm text-white placeholder-frame-textMuted resize-none',
          'focus:outline-none focus:border-frame-accent focus:ring-1 focus:ring-frame-accent/30 transition-all',
          error && 'border-red-500',
          className
        )}
        {...props}
      />
      {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
    </div>
  );
}
