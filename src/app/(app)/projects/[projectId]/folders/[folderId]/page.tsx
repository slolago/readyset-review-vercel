'use client';

import { useParams } from 'next/navigation';
import { FolderBrowser } from '@/components/files/FolderBrowser';

export default function FolderPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const folderId = params.folderId as string;

  return <FolderBrowser projectId={projectId} folderId={folderId} />;
}
