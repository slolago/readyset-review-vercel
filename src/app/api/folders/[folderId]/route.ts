import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { canAccessProject, canRenameFolder, canDeleteFolder } from '@/lib/permissions';
import type { Project } from '@/types';

interface RouteParams {
  params: { folderId: string };
}

async function loadProject(projectId: string): Promise<Project | null> {
  const db = getAdminDb();
  const doc = await db.collection('projects').doc(projectId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as Project;
}

/** Convert Firestore Timestamps and other non-JSON types to plain values */
function serializeDoc(data: Record<string, unknown>, id: string): Record<string, unknown> {
  const out: Record<string, unknown> = { id };
  for (const [k, v] of Object.entries(data)) {
    if (v !== null && typeof v === 'object' && typeof (v as any).toDate === 'function') {
      out[k] = (v as any).toDate().toISOString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const doc = await db.collection('folders').doc(params.folderId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const folder = serializeDoc(doc.data()!, doc.id);
    const project = await loadProject(folder.projectId as string);
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!canAccessProject(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Always walk parentId chain — simple, reliable, no dependency on path[] consistency.
    // Typical depth is 3–6 levels so this is only a few sequential reads.
    const ancestors: Record<string, unknown>[] = [];
    let parentId = doc.data()!.parentId as string | null | undefined;
    let depth = 0;
    while (parentId && typeof parentId === 'string' && depth < 20) {
      const parentDoc = await db.collection('folders').doc(parentId).get();
      if (!parentDoc.exists) break;
      const parent = serializeDoc(parentDoc.data()!, parentDoc.id);
      ancestors.unshift(parent);
      parentId = parent.parentId as string | null | undefined;
      depth++;
    }

    return NextResponse.json({ folder, ancestors });
  } catch (err) {
    console.error('GET folder error:', err);
    return NextResponse.json({ error: 'Failed to fetch folder' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const doc = await db.collection('folders').doc(params.folderId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const folder = doc.data() as any;
    const project = await loadProject(folder.projectId);
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!canRenameFolder(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rawUpdates = await request.json();
    // Whitelist: only name and parentId can be changed. Never allow mutating
    // projectId, path, createdAt, createdBy — those would break the folder tree.
    const ALLOWED = ['name', 'parentId'];
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawUpdates)) {
      if (ALLOWED.includes(k)) updates[k] = v;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
    }
    // If parentId changes, verify the new parent belongs to the same project
    if (typeof updates.parentId === 'string') {
      const newParent = await db.collection('folders').doc(updates.parentId as string).get();
      if (!newParent.exists) return NextResponse.json({ error: 'Parent folder not found' }, { status: 400 });
      if ((newParent.data() as any).projectId !== folder.projectId) {
        return NextResponse.json({ error: 'Cannot move folder to a different project' }, { status: 400 });
      }
    }
    await db.collection('folders').doc(params.folderId).update(updates);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Folder update error:', err);
    return NextResponse.json({ error: 'Failed to update folder' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const doc = await db.collection('folders').doc(params.folderId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const folder = doc.data() as any;
    const project = await loadProject(folder.projectId);
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!canDeleteFolder(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Cascade: collect all descendant folder IDs via BFS so we can batch delete.
    // Assets inside these folders are re-parented to null (preserved as unfiled)
    // — deleting thousands of GCS blobs on cascade is risky and irreversible.
    const toDelete: string[] = [params.folderId];
    const queue: string[] = [params.folderId];
    while (queue.length > 0) {
      const parentId = queue.shift()!;
      const children = await db.collection('folders').where('parentId', '==', parentId).get();
      for (const child of children.docs) {
        toDelete.push(child.id);
        queue.push(child.id);
      }
    }

    const BATCH_LIMIT = 400;
    // Re-parent all assets in these folders to null
    for (const fid of toDelete) {
      const assetsSnap = await db.collection('assets').where('folderId', '==', fid).get();
      for (let i = 0; i < assetsSnap.docs.length; i += BATCH_LIMIT) {
        const batch = db.batch();
        assetsSnap.docs.slice(i, i + BATCH_LIMIT).forEach((d) => batch.update(d.ref, { folderId: null }));
        await batch.commit();
      }
    }
    // Delete folders (batched)
    for (let i = 0; i < toDelete.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      toDelete.slice(i, i + BATCH_LIMIT).forEach((id) => batch.delete(db.collection('folders').doc(id)));
      await batch.commit();
    }

    return NextResponse.json({ success: true, foldersDeleted: toDelete.length });
  } catch (err) {
    console.error('Folder delete error:', err);
    return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 });
  }
}
