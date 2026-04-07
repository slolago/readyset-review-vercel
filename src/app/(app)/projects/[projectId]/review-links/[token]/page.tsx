'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { ReviewLinkFolderBrowser } from '@/components/review/ReviewLinkFolderBrowser';

function ReviewLinkPageInner() {
  const params = useParams();
  const projectId = params.projectId as string;
  const token = params.token as string;
  return <ReviewLinkFolderBrowser projectId={projectId} token={token} />;
}

export default function ReviewLinkPage() {
  return (
    <Suspense fallback={null}>
      <ReviewLinkPageInner />
    </Suspense>
  );
}
