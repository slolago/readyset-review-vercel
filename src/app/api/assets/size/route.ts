import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { canAccessProject } from '@/lib/permissions';
import { getAdminDb } from '@/lib/firebase-admin';
import type { Project } from '@/types';

function getDescendantFolderIds(rootId: string, folders: any[]): Set<string> {
  const result = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of folders) {
      if (!result.has(f.id) && f.parentId && result.has(f.parentId)) {
        result.add(f.id);
        changed = true;
      }
    }
  }
  return result;
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const folderId = searchParams.get('folderId') || null;

  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  try {
    const db = getAdminDb();

    const projectDoc = await db.collection('projects').doc(projectId).get();
    if (!projectDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const project = { id: projectDoc.id, ...projectDoc.data() } as Project;
    if (!canAccessProject(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch all assets for the project
    const snap = await db.collection('assets').where('projectId', '==', projectId).get();
    const allAssets = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

    let scopedFolderIds: Set<string> | null = null;

    if (folderId !== null) {
      // Fetch all folders to resolve descendants
      const foldersSnap = await db.collection('folders').where('projectId', '==', projectId).get();
      const allFolders = foldersSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
      scopedFolderIds = getDescendantFolderIds(folderId, allFolders);
    }

    let sizeBytes = 0;
    for (const asset of allAssets) {
      if (asset.deletedAt) continue; // SDC-04: exclude soft-deleted from size total
      const inScope =
        scopedFolderIds === null
          ? true
          : scopedFolderIds.has(asset.folderId ?? '');
      if (inScope) {
        sizeBytes += (asset.size as number) || 0;
      }
    }

    return NextResponse.json({ sizeBytes });
  } catch (err) {
    console.error('[GET /api/assets/size]', err);
    return NextResponse.json({ error: 'Failed to calculate size' }, { status: 500 });
  }
}
