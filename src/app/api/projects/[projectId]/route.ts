import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { deleteFile } from '@/lib/gcs';
import { Timestamp } from 'firebase-admin/firestore';
import {
  canAccessProject,
  canRenameProject,
  canDeleteProject,
} from '@/lib/permissions';
import type { Project } from '@/types';

interface RouteParams {
  params: { projectId: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const doc = await db.collection('projects').doc(params.projectId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const project = { id: doc.id, ...doc.data() } as Project;
    if (!canAccessProject(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ project });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const doc = await db.collection('projects').doc(params.projectId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const project = { id: doc.id, ...doc.data() } as Project;
    if (!canRenameProject(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rawUpdates = await request.json();
    // Whitelist: only owner-changeable metadata. Never allow changing ownerId
    // or collaborators through this endpoint — those have dedicated routes.
    const ALLOWED = ['name', 'description', 'color', 'coverImage'];
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawUpdates)) {
      if (ALLOWED.includes(k)) updates[k] = v;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
    }
    await db.collection('projects').doc(params.projectId).update({
      ...updates,
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Project update error:', err);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const doc = await db.collection('projects').doc(params.projectId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const project = { id: doc.id, ...doc.data() } as Project;
    if (!canDeleteProject(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Cascade delete: remove all folders, assets, comments, and review links
    // that reference this project. Also delete GCS blobs (videos, thumbnails,
    // sprites) so we don't leak storage costs. Non-fatal errors logged.
    const BATCH = 400;
    const deleteInBatches = async (collection: string) => {
      const snap = await db.collection(collection).where('projectId', '==', params.projectId).get();
      for (let i = 0; i < snap.docs.length; i += BATCH) {
        const batch = db.batch();
        snap.docs.slice(i, i + BATCH).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      return snap.size;
    };

    // First: find all assets so we can delete their GCS blobs, THEN delete the docs
    const assetsSnap = await db.collection('assets').where('projectId', '==', params.projectId).get();
    const blobPaths: string[] = [];
    for (const d of assetsSnap.docs) {
      const a = d.data() as any;
      if (a.gcsPath) blobPaths.push(a.gcsPath);
      if (a.thumbnailGcsPath) blobPaths.push(a.thumbnailGcsPath);
      if (a.spriteStripGcsPath) blobPaths.push(a.spriteStripGcsPath);
    }
    // Delete blobs in parallel chunks to avoid hammering GCS
    const CHUNK = 20;
    for (let i = 0; i < blobPaths.length; i += CHUNK) {
      await Promise.all(blobPaths.slice(i, i + CHUNK).map((p) => deleteFile(p).catch(console.error)));
    }

    const counts = {
      folders: await deleteInBatches('folders'),
      assets: await deleteInBatches('assets'),
      comments: await deleteInBatches('comments'),
      reviewLinks: await deleteInBatches('reviewLinks'),
      blobsDeleted: blobPaths.length,
    };

    await db.collection('projects').doc(params.projectId).delete();
    return NextResponse.json({ success: true, cascaded: counts });
  } catch (err) {
    console.error('Project delete error:', err);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
