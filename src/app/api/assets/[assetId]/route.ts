import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { generateReadSignedUrl, generateDownloadSignedUrl } from '@/lib/gcs';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { fetchGroupMembers, resolveGroupId } from '@/lib/version-groups';
import { canAccessProject, canRenameAsset, canDeleteAsset } from '@/lib/permissions';
import type { Project } from '@/types';

interface RouteParams {
  params: { assetId: string };
}

async function loadProject(projectId: string): Promise<Project | null> {
  const db = getAdminDb();
  const doc = await db.collection('projects').doc(projectId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as Project;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const doc = await db.collection('assets').doc(params.assetId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const asset = { id: doc.id, ...doc.data() } as any;
    const project = await loadProject(asset.projectId);
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!canAccessProject(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (asset.gcsPath && asset.status === 'ready') {
      const [signedUrl, downloadUrl] = await Promise.all([
        generateReadSignedUrl(asset.gcsPath, 120),
        generateDownloadSignedUrl(asset.gcsPath, asset.name, 120).catch(() => undefined),
      ]);
      asset.signedUrl = signedUrl;
      if (downloadUrl) asset.downloadUrl = downloadUrl;
    }

    // Fetch all versions in the same group via shared helper (handles legacy-root)
    const groupId = resolveGroupId(asset, params.assetId);
    const groupMembers = await fetchGroupMembers(db, groupId);
    const versionDocs = groupMembers.map((m) => ({ id: m.id, ...m.data } as any));

    const versions = await Promise.all(
      versionDocs.map(async (v) => {
        if (v.gcsPath && v.status === 'ready') {
          try {
            const [signedUrl, downloadUrl] = await Promise.all([
              generateReadSignedUrl(v.gcsPath, 120),
              generateDownloadSignedUrl(v.gcsPath, v.name, 120).catch(() => undefined),
            ]);
            v.signedUrl = signedUrl;
            if (downloadUrl) v.downloadUrl = downloadUrl;
          } catch {}
        }
        return v;
      })
    );
    versions.sort((a, b) => (a.version || 1) - (b.version || 1));

    return NextResponse.json({ asset, versions });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch asset' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const doc = await db.collection('assets').doc(params.assetId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const asset = doc.data() as any;
    const project = await loadProject(asset.projectId);
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!canRenameAsset(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rawUpdates = await request.json();
    // Whitelist: only safe, user-mutable asset metadata. Never allow changing
    // gcsPath/projectId/uploadedBy/createdAt/status/versionGroupId/size etc.
    const ALLOWED = ['name', 'folderId', 'reviewStatus', 'description'];
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawUpdates)) {
      if (ALLOWED.includes(k)) updates[k] = v;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
    }

    // When moving (folderId changes), update ALL versions in the group atomically
    if ('folderId' in updates) {
      const groupId = asset.versionGroupId || params.assetId;
      const siblingsSnap = await db.collection('assets')
        .where('versionGroupId', '==', groupId)
        .get();

      const batch = db.batch();
      // Always include the root asset (may lack versionGroupId field)
      batch.update(db.collection('assets').doc(params.assetId), updates);
      for (const sib of siblingsSnap.docs) {
        if (sib.id !== params.assetId) {
          batch.update(sib.ref, { folderId: updates.folderId });
        }
      }
      await batch.commit();
    } else {
      const safeUpdates: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(updates)) {
        safeUpdates[k] = v === null ? FieldValue.delete() : v;
      }
      await db.collection('assets').doc(params.assetId).update(safeUpdates);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update asset' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const doc = await db.collection('assets').doc(params.assetId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const asset = doc.data() as any;
    const project = await loadProject(asset.projectId);
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!canDeleteAsset(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Soft-delete: mark deletedAt/deletedBy. GCS blobs and comments stay
    // intact so restore is lossless. Permanent destruction happens via
    // /api/trash/permanent-delete.
    await db.collection('assets').doc(params.assetId).update({
      deletedAt: Timestamp.now(),
      deletedBy: user.id,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Asset soft-delete error:', err);
    return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 });
  }
}
