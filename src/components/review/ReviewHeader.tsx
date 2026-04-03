'use client';

import Image from 'next/image';
import { MessageSquare, Eye } from 'lucide-react';
import type { ReviewLink } from '@/types';

interface ReviewHeaderProps {
  reviewLink: ReviewLink;
  projectName: string;
}

export function ReviewHeader({ reviewLink, projectName }: ReviewHeaderProps) {
  return (
    <header className="bg-frame-sidebar border-b border-frame-border px-6 py-3 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-4">
        <Image
          src="https://readyset.co/wp-content/uploads/2025/09/01.logo-horizontal.png"
          alt="Ready Set"
          width={100}
          height={28}
          className="object-contain"
          unoptimized
        />
        <div className="w-px h-5 bg-frame-border" />
        <div>
          <h1 className="text-sm font-semibold text-white leading-tight">{reviewLink.name}</h1>
          <p className="text-xs text-frame-textMuted">{projectName}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-frame-border text-frame-textMuted">
        {reviewLink.allowComments ? (
          <>
            <MessageSquare className="w-3 h-3 text-frame-accent" />
            <span>Comments enabled</span>
          </>
        ) : (
          <>
            <Eye className="w-3 h-3" />
            <span>View only</span>
          </>
        )}
      </div>
    </header>
  );
}
