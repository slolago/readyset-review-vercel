'use client';

import Image from 'next/image';
import { MessageSquare, Eye, Clock } from 'lucide-react';
import type { ReviewLink } from '@/types';

interface ReviewHeaderProps {
  reviewLink: ReviewLink;
  projectName: string;
}

function formatHoursRemaining(ms: number): string {
  const totalMinutes = Math.max(1, Math.floor(ms / 60000));
  if (totalMinutes < 60) {
    return `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}`;
  }
  const hours = Math.floor(totalMinutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

export function ReviewHeader({ reviewLink, projectName }: ReviewHeaderProps) {
  const expiresAt = reviewLink.expiresAt;
  const expiryDate = expiresAt && typeof (expiresAt as any).toDate === 'function'
    ? (expiresAt as any).toDate() as Date
    : null;
  const msUntilExpiry = expiryDate ? expiryDate.getTime() - Date.now() : null;
  const showExpiryBanner =
    msUntilExpiry !== null && msUntilExpiry > 0 && msUntilExpiry <= 24 * 60 * 60 * 1000;

  return (
    <>
      <header className="bg-frame-sidebar border-b border-frame-border px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <Image
            src="/logo-horizontal.png"
            alt="Ready Set"
            width={100}
            height={28}
            className="object-contain"
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
      {showExpiryBanner && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-400 text-xs px-6 py-1.5 flex items-center gap-2 flex-shrink-0">
          <Clock className="w-3 h-3" />
          This link expires in {formatHoursRemaining(msUntilExpiry!)}.
        </div>
      )}
    </>
  );
}
