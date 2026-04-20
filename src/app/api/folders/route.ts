import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { canAccessProject, canCreateFolder } from '@/lib/permissions';
import type { Project } from '@/types';

async function loadProject(projectId: string): Promise<Project | null> {
  const db = getAdminDb();
  const doc = await db.collection('projects').doc(projectId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as Project;
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const parentId = searchParams.get('parentId') || null;
  const all = searchParams.get('all') === 'true';

  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const project = await loadProject(projectId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canAccessProject(user, project)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const db = getAdminDb();
    const snap = await db.collection('folders').where('projectId', '==', projectId).get();
    const allFolders = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
    // Hide soft-deleted folders from normal listings — they surface only in the Trash view.
    const liveFolders = allFolders.filter((f: any) => !f.deletedAt);
    const folders = all
      ? liveFolders.sort((a: any, b: any) => a.createdAt?.toMillis() - b.createdAt?.toMillis())
      : liveFolders
          .filter((f: any) => (f.parentId ?? null) === parentId)
          .sort((a: any, b: any) => a.createdAt?.toMillis() - b.createdAt?.toMillis());

    return NextResponse.json({ folders });
  } catch (err) {
    console.error('GET folders error:', err);
    return NextResponse.json({ error: 'Failed to fetch folders' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { name, projectId, parentId } = await request.json();
    if (!name || !projectId) return NextResponse.json({ error: 'name and projectId required' }, { status: 400 });

    const project = await loadProject(projectId);
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!canCreateFolder(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = getAdminDb();
    let path: string[] = [];
    if (parentId) {
      const parentDoc = await db.collection('folders').doc(parentId).get();
      if (parentDoc.exists) {
        const parent = parentDoc.data() as any;
        path = [...(parent.path || []), parentId];
      }
    }

    const ref = await db.collection('folders').add({
      name,
      projectId,
      parentId: parentId || null,
      path,
      createdAt: Timestamp.now(),
    });

    const doc = await ref.get();
    return NextResponse.json({ folder: { id: ref.id, ...doc.data() } }, { status: 201 });
  } catch (err) {
    console.error('POST folder error:', err);
    return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 });
  }
}
