import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { canAccessProject, canRenameFolder, canDeleteFolder } from '@/lib/permissions';
import { validateFolderRename } from '@/lib/names';
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

    // DC-03: rename collision check. Scoped to siblings at the CURRENT parent —
    // if parentId also changes in the same PUT, move-collision at the new parent
    // is out of scope (no UI emits that combo today).
    if (typeof updates.name === 'string') {
      const result = await validateFolderRename(db, params.folderId, updates.name);
      if (!result.ok) {
        if (result.code === 'EMPTY_NAME') {
          return NextResponse.json({ error: 'Name cannot be empty', code: result.code }, { status: 400 });
        }
        return NextResponse.json(
          { error: `A folder named "${updates.name.trim()}" already exists here`, code: result.code },
          { status: 409 }
        );
      }
      updates.name = result.trimmed;
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

    // Soft-delete the folder only — children keep their parentId and are
    // hidden from normal views by the list-endpoint filter (which excludes
    // items whose parent folder is soft-deleted). On restore, children
    // automatically reappear.
    await db.collection('folders').doc(params.folderId).update({
      deletedAt: Timestamp.now(),
      deletedBy: user.id,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Folder soft-delete error:', err);
    return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 });
  }
}
