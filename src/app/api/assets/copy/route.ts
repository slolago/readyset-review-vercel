import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, canAccessProject } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { assetId, targetFolderId, name, latestVersionOnly } = await request.json();
    if (!assetId) return NextResponse.json({ error: 'assetId required' }, { status: 400 });

    const db = getAdminDb();
    const doc = await db.collection('assets').doc(assetId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const source = doc.data() as any;
    const hasAccess = await canAccessProject(user.id, source.projectId);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // targetFolderId may be null (project root) or a folder id; if omitted default to same folder
    const destinationFolderId = targetFolderId !== undefined ? targetFolderId : source.folderId;

    // Fetch all versions in the stack so the copy is a complete independent group
    const versionGroupId = source.versionGroupId || assetId;
    const stackSnap = await db.collection('assets')
      .where('versionGroupId', '==', versionGroupId)
      .get();
    const allVersions: any[] = stackSnap.empty
      ? [source]  // fallback: just the one asset
      : stackSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Sort by version number ascending so ordering is preserved
    allVersions.sort((a: any, b: any) => (a.version || 1) - (b.version || 1));

    const versionsToCopy = latestVersionOnly
      ? [allVersions[allVersions.length - 1]]
      : allVersions;

    // New versionGroupId for the entire copy-stack
    const newGroupId = db.collection('assets').doc().id;

    // Create copies of ALL versions in a single batch
    const batch = db.batch();
    for (const ver of versionsToCopy) {
      const newRef = db.collection('assets').doc();
      const copyData: any = {
        ...ver,
        folderId: destinationFolderId,
        // Only the asset matching the requested assetId gets the "Copy of" prefix (or name override)
        name: ver.id === assetId ? (name ?? `Copy of ${ver.name}`) : ver.name,
        versionGroupId: newGroupId,
        version: versionsToCopy.length === 1 && latestVersionOnly ? 1 : ver.version,
        createdAt: Timestamp.now(),
        uploadedBy: user.id,
      };
      // Firestore stores the doc id as the key, not a field
      delete copyData.id;
      batch.set(newRef, copyData);
    }
    await batch.commit();

    return NextResponse.json({ id: newGroupId }, { status: 201 });
  } catch (err) {
    console.error('POST assets/copy error:', err);
    return NextResponse.json({ error: 'Failed to copy asset' }, { status: 500 });
  }
}
