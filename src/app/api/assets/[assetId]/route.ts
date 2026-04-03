import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, canAccessProject } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { deleteFile, generateReadSignedUrl } from '@/lib/gcs';

interface RouteParams {
  params: { assetId: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const doc = await db.collection('assets').doc(params.assetId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const asset = { id: doc.id, ...doc.data() } as any;
    const hasAccess = await canAccessProject(user.id, asset.projectId);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    if (asset.gcsPath && asset.status === 'ready') {
      asset.signedUrl = await generateReadSignedUrl(asset.gcsPath, 120);
    }

    // Fetch all versions in the same group
    // groupId is always the root asset's ID (either stored explicitly or derived from asset.id)
    const groupId = asset.versionGroupId || asset.id;

    const versionsSnap = await db.collection('assets')
      .where('versionGroupId', '==', groupId)
      .get();

    let versionDocs = versionsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

    // The root asset may not have versionGroupId set (old assets) — add it by ID if missing
    if (!versionDocs.some((v) => v.id === groupId)) {
      const rootDoc = await db.collection('assets').doc(groupId).get();
      if (rootDoc.exists) {
        versionDocs.push({ id: rootDoc.id, ...rootDoc.data() } as any);
      }
    }

    const versions = await Promise.all(
      versionDocs.map(async (v) => {
        if (v.gcsPath && v.status === 'ready') {
          try { v.signedUrl = await generateReadSignedUrl(v.gcsPath, 120); } catch {}
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
    const hasAccess = await canAccessProject(user.id, asset.projectId);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const updates = await request.json();
    await db.collection('assets').doc(params.assetId).update(updates);
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
    const hasAccess = await canAccessProject(user.id, asset.projectId);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Delete from GCS
    if (asset.gcsPath) {
      await deleteFile(asset.gcsPath).catch(console.error);
    }

    await db.collection('assets').doc(params.assetId).delete();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 });
  }
}
