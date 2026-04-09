import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, canAccessProject } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { orderedIds } = body;

    // Validate orderedIds — must be a non-empty array of strings
    if (
      !orderedIds ||
      !Array.isArray(orderedIds) ||
      orderedIds.length === 0 ||
      !orderedIds.every((id: unknown) => typeof id === 'string')
    ) {
      return NextResponse.json(
        { error: 'orderedIds must be a non-empty array of strings' },
        { status: 400 }
      );
    }

    const db = getAdminDb();

    // Fetch first asset to get projectId for auth check (before transaction)
    const firstDocSnap = await db.collection('assets').doc(orderedIds[0]).get();
    if (!firstDocSnap.exists) {
      return NextResponse.json({ error: `Asset ${orderedIds[0]} not found` }, { status: 404 });
    }

    const firstAsset = firstDocSnap.data() as any;

    // Auth check outside transaction to avoid complicating retries
    const hasAccess = await canAccessProject(user.id, firstAsset.projectId);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Firestore transaction — guards against stale reads (per STATE.md mandate)
    await db.runTransaction(async (tx) => {
      const refs = orderedIds.map((id: string) => db.collection('assets').doc(id));
      const docs = await Promise.all(refs.map((r) => tx.get(r)));

      // Verify all docs exist
      for (const doc of docs) {
        if (!doc.exists) throw new Error(`Asset ${doc.id} not found`);
      }

      // Verify all belong to the same versionGroupId
      const groupIds = new Set(
        docs.map((d) => {
          const data = d.data() as any;
          return data.versionGroupId || d.id;
        })
      );
      if (groupIds.size > 1) throw new Error('Cross-group reorder not allowed');

      // Write new version numbers 1..N in caller-specified order
      docs.forEach((doc, i) => {
        tx.update(doc.ref, { version: i + 1 });
      });
    });

    return NextResponse.json({ reordered: orderedIds.length }, { status: 200 });
  } catch (err: any) {
    const msg: string = err?.message ?? '';
    if (msg.includes('Cross-group')) {
      return NextResponse.json({ error: 'Cross-group reorder not allowed' }, { status: 400 });
    }
    if (msg.includes('not found')) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error('POST assets/reorder-versions error:', err);
    return NextResponse.json({ error: 'Failed to reorder versions' }, { status: 500 });
  }
}
