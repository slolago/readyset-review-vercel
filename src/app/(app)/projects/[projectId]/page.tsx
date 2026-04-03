'use client';

import { useParams } from 'next/navigation';
import { FolderBrowser } from '@/components/files/FolderBrowser';

export default function ProjectRootPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  return <FolderBrowser projectId={projectId} folderId={null} />;
}
