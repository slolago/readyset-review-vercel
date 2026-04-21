import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  canPermanentDeleteAsset,
  canPermanentDeleteFolder,
  canAccessProject,
} from '@/lib/permissions';
import { hardDeleteAsset, hardDeleteFolder } from '@/lib/trash';
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
    // Require the item be in trash — we don't allow bypassing soft-delete.
    if (!data.deletedAt) {
      return NextResponse.json(
        { error: 'Item must be in trash before permanent delete' },
        { status: 400 }
      );
    }

    const projDoc = await db.collection('projects').doc(data.projectId).get();
    if (!projDoc.exists) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const project = { id: projDoc.id, ...projDoc.data() } as Project;
    if (!canAccessProject(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const allowed = type === 'asset'
      ? canPermanentDeleteAsset(user, project)
      : canPermanentDeleteFolder(user, project);
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    if (type === 'asset') {
      await hardDeleteAsset(db, id);
    } else {
      await hardDeleteFolder(db, id);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Permanent-delete error:', err);
    return NextResponse.json({ error: 'Failed to permanently delete' }, { status: 500 });
  }
}
