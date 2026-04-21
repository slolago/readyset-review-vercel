import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { fetchGroupMembersTx, resolveGroupId } from '@/lib/version-groups';
import { canModifyStack } from '@/lib/permissions';
import type { Project } from '@/types';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { assetId } = await request.json();

    if (!assetId) {
      return NextResponse.json({ error: 'assetId is required' }, { status: 400 });
    }

    const db = getAdminDb();

    // Fetch the target asset doc (pre-transaction — used for auth)
    const assetDoc = await db.collection('assets').doc(assetId).get();
    if (!assetDoc.exists) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const asset = assetDoc.data() as any;

    // Auth check
    const projDoc = await db.collection('projects').doc(asset.projectId).get();
    if (!projDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const project = { id: projDoc.id, ...projDoc.data() } as Project;
    if (!canModifyStack(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Resolve group
    const groupId = resolveGroupId(asset, assetId);

    // Firestore transaction: all reads first (fetchGroupMembersTx), then all writes.
    // Guards against partial unstacks under concurrent access.
    const result = await db.runTransaction(async (tx) => {
      const members = await fetchGroupMembersTx(db, tx, groupId);

      // Remove the target asset from the members array
      const remaining = members.filter((m) => m.id !== assetId);

      if (remaining.length === 0) {
        throw new Error('NOT_A_STACK');
      }

      // Bug 2 fix: if the detached asset WAS the original root (assetId === groupId),
      // remaining members still carry versionGroupId === groupId === assetId. After
      // we set the detached asset's versionGroupId to its own id, remaining members
      // would appear as a ghost stack rooted on the now-standalone asset. Re-root
      // them onto remaining[0].id (first by version ascending).
      const needsReroot = assetId === groupId;
      remaining.sort((a, b) => a.version - b.version);
      const newGroupId = needsReroot ? remaining[0].id : groupId;

      // Detach target — becomes standalone with versionGroupId set to its own id
      tx.update(db.collection('assets').doc(assetId), {
        versionGroupId: assetId, // CRITICAL: set to own id, never null
        version: 1,
      });

      // Re-compact remaining 1..N AND re-root versionGroupId when needed
      remaining.forEach((m, i) => {
        const update: Record<string, unknown> = { version: i + 1 };
        if (needsReroot) update.versionGroupId = newGroupId;
        tx.update(db.collection('assets').doc(m.id), update);
      });

      return { remaining: remaining.length };
    });

    return NextResponse.json({ unstacked: assetId, remaining: result.remaining }, { status: 200 });
  } catch (err: any) {
    if (err?.message === 'NOT_A_STACK') {
      return NextResponse.json({ error: 'Asset is not part of a version stack' }, { status: 400 });
    }
    console.error('POST assets/unstack-version error:', err);
    return NextResponse.json({ error: 'Failed to unstack version' }, { status: 500 });
  }
}
