'use client';

import Image from 'next/image';
import { cn, getInitials } from '@/lib/utils';

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
};

const imgSizes = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
};

function stringToColor(str: string): string {
  const colors = [
    '#6c5ce7', '#0984e3', '#00b894', '#e17055',
    '#e67e22', '#fd79a8', '#00cec9', '#fdcb6e',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const color = stringToColor(name);
  const px = imgSizes[size];

  return (
    <div
      className={cn(
        'rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center font-semibold',
        sizes[size],
        className
      )}
      style={{ backgroundColor: src ? 'transparent' : color + '30', color }}
    >
      {src ? (
        <Image
          src={src}
          alt={name}
          width={px}
          height={px}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <span>{getInitials(name)}</span>
      )}
    </div>
  );
}
