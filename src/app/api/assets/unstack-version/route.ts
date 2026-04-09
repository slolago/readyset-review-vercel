import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, canAccessProject } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { assetId } = await request.json();

    if (!assetId) {
      return NextResponse.json({ error: 'assetId is required' }, { status: 400 });
    }

    const db = getAdminDb();

    // Fetch the target asset doc
    const assetDoc = await db.collection('assets').doc(assetId).get();
    if (!assetDoc.exists) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const asset = assetDoc.data() as any;

    // Auth check
    const hasAccess = await canAccessProject(user.id, asset.projectId);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Resolve group
    const groupId: string = asset.versionGroupId || assetId;

    // Self-check: if asset is already standalone (groupId === assetId), check for other members
    if (groupId === assetId) {
      const standaloneSnap = await db.collection('assets')
        .where('versionGroupId', '==', assetId)
        .get();
      const otherMembers = standaloneSnap.docs.filter((d) => d.id !== assetId);
      if (otherMembers.length === 0) {
        return NextResponse.json({ error: 'Asset is not part of a version stack' }, { status: 400 });
      }
    }

    // Query all group members
    const groupSnap = await db.collection('assets')
      .where('versionGroupId', '==', groupId)
      .get();

    let members: Array<{ id: string; version: number }> = groupSnap.docs.map((d) => ({
      id: d.id,
      version: (d.data() as any).version || 1,
    }));

    // Root inclusion guard — root asset may not have versionGroupId set
    if (!members.some((m) => m.id === groupId)) {
      const rootDoc = await db.collection('assets').doc(groupId).get();
      if (rootDoc.exists) {
        members.push({ id: groupId, version: (rootDoc.data() as any).version || 1 });
      }
    }

    // Remove the target asset from the members array
    const remaining = members.filter((m) => m.id !== assetId);

    // Guard: should not happen due to self-check above, but protect against edge cases
    if (remaining.length === 0) {
      return NextResponse.json({ error: 'Asset is not part of a version stack' }, { status: 400 });
    }

    // Batch write: detach target and re-compact remaining version numbers 1..N
    const batch = db.batch();

    // Detach target — becomes standalone with versionGroupId set to its own id
    batch.update(db.collection('assets').doc(assetId), {
      versionGroupId: assetId, // CRITICAL: set to own id, never null
      version: 1,
    });

    // Re-compact remaining 1..N
    remaining.sort((a, b) => a.version - b.version);
    remaining.forEach((m, i) => {
      batch.update(db.collection('assets').doc(m.id), { version: i + 1 });
    });

    await batch.commit();

    return NextResponse.json({ unstacked: assetId, remaining: remaining.length }, { status: 200 });
  } catch (err) {
    console.error('POST assets/unstack-version error:', err);
    return NextResponse.json({ error: 'Failed to unstack version' }, { status: 500 });
  }
}
