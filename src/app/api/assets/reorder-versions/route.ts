import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, canAccessProject } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { orderedIds } = await request.json();

    // Validate orderedIds
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

    // Auth check: fetch first asset to get projectId
    const firstDoc = await db.collection('assets').doc(orderedIds[0]).get();
    if (!firstDoc.exists) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }
    const firstAsset = firstDoc.data() as any;
    const hasAccess = await canAccessProject(user.id, firstAsset.projectId);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Run Firestore transaction to atomically reorder version numbers
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
    console.error('POST assets/reorder-versions error:', err);
    if (err?.message?.includes('Cross-group')) {
      return NextResponse.json({ error: 'Cross-group reorder not allowed' }, { status: 400 });
    }
    if (err?.message?.includes('not found')) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to reorder versions' }, { status: 500 });
  }
}
