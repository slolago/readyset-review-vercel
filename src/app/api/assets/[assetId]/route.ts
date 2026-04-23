import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { generateReadSignedUrl, generateDownloadSignedUrl } from '@/lib/gcs';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { fetchGroupMembers, resolveGroupId } from '@/lib/version-groups';
import { canAccessProject, canRenameAsset, canDeleteAsset } from '@/lib/permissions';
import { validateAssetRename } from '@/lib/names';
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
          } catch (err) {
            console.error('[GET /api/assets/[assetId]] sign version URLs failed', err);
          }
        }
        return v;
      })
    );
    versions.sort((a, b) => (a.version || 1) - (b.version || 1));

    return NextResponse.json({ asset, versions });
  } catch (err) {
    console.error('[GET /api/assets/[assetId]]', err);
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
    const ALLOWED = ['name', 'folderId', 'reviewStatus', 'description', 'rating'];
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawUpdates)) {
      if (ALLOWED.includes(k)) updates[k] = v;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
    }

    // Rating: coerce + validate. 0 clears the rating (stored as null -> deleted
    // by the FieldValue.delete() pass below).
    if ('rating' in updates) {
      const r = updates.rating;
      if (r === null || r === 0) {
        updates.rating = null;
      } else if (typeof r === 'number' && Number.isInteger(r) && r >= 1 && r <= 5) {
        updates.rating = r;
      } else {
        return NextResponse.json(
          { error: 'rating must be an integer 1–5, or 0/null to clear' },
          { status: 400 }
        );
      }
    }

    // DC-03: rename collision check. Scopes siblings by projectId + folderId,
    // excludes self and soft-deleted, case-insensitive.
    if (typeof updates.name === 'string') {
      const result = await validateAssetRename(db, params.assetId, updates.name);
      if (!result.ok) {
        if (result.code === 'EMPTY_NAME') {
          return NextResponse.json({ error: 'Name cannot be empty', code: result.code }, { status: 400 });
        }
        return NextResponse.json(
          { error: `An asset named "${updates.name.trim()}" already exists here`, code: result.code },
          { status: 409 }
        );
      }
      updates.name = result.trimmed;
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
  } catch (err) {
    console.error('[PUT /api/assets/[assetId]]', err);
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

    // BLK-01: ?allVersions=true soft-deletes every group member atomically.
    // Default (flag absent) preserves single-doc behavior used by VersionStackModal.
    const allVersions = new URL(request.url).searchParams.get('allVersions') === 'true';

    if (allVersions) {
      const groupId = resolveGroupId(asset, params.assetId);
      const members = await fetchGroupMembers(db, groupId);
      const batch = db.batch();
      const now = Timestamp.now();
      for (const m of members) {
        batch.update(db.collection('assets').doc(m.id), {
          deletedAt: now,
          deletedBy: user.id,
        });
      }
      await batch.commit();
      return NextResponse.json({ success: true, count: members.length });
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
