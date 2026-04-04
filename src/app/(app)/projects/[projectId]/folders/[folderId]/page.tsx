'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { FolderBrowser } from '@/components/files/FolderBrowser';

export default function FolderPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const folderId = params.folderId as string;
  const ancestorPath = searchParams.get('path') || '';

  return <FolderBrowser projectId={projectId} folderId={folderId} ancestorPath={ancestorPath} />;
}
