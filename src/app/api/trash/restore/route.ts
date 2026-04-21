import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  canRestoreAsset,
  canRestoreFolder,
  canAccessProject,
} from '@/lib/permissions';
import type { Project } from '@/types';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { type, id } = await request.json();
  if (type !== 'asset' && type !== 'folder') {
    return NextResponse.json({ error: 'type must be asset|folder' }, { status: 400 });
  }
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const collection = type === 'asset' ? 'assets' : 'folders';
    const doc = await db.collection(collection).doc(id).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const data = doc.data() as any;
    if (!data.deletedAt) {
      return NextResponse.json({ error: 'Not in trash' }, { status: 400 });
    }

    const projDoc = await db.collection('projects').doc(data.projectId).get();
    if (!projDoc.exists) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const project = { id: projDoc.id, ...projDoc.data() } as Project;
    if (!canAccessProject(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const allowed = type === 'asset'
      ? canRestoreAsset(user, project)
      : canRestoreFolder(user, project);
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Phase 63 (IDX-01): write `null` instead of deleting the field so the
    // restored doc remains indexable by `(projectId, folderId, deletedAt)`
    // composite queries. A missing field would exclude it from those queries.
    const updates: Record<string, unknown> = {
      deletedAt: null,
      deletedBy: FieldValue.delete(),
    };

    // If restoring an asset whose parent folder is still trashed (or gone),
    // reparent to project root so it doesn't vanish behind the list filter.
    if (type === 'asset' && data.folderId) {
      const parentDoc = await db.collection('folders').doc(data.folderId).get();
      const parentDeleted = !parentDoc.exists || !!(parentDoc.data() as any).deletedAt;
      if (parentDeleted) updates.folderId = null;
    }

    await db.collection(collection).doc(id).update(updates);
    return NextResponse.json({
      success: true,
      reparentedToRoot: updates.folderId === null,
    });
  } catch (err) {
    console.error('Restore error:', err);
    return NextResponse.json({ error: 'Failed to restore' }, { status: 500 });
  }
}
