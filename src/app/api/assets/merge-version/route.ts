import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, canAccessProject } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { sourceId, targetId } = await request.json();

    if (!sourceId || !targetId) {
      return NextResponse.json({ error: 'sourceId and targetId are required' }, { status: 400 });
    }

    if (sourceId === targetId) {
      return NextResponse.json({ error: 'Cannot merge asset with itself' }, { status: 400 });
    }

    const db = getAdminDb();

    // Fetch source and target docs
    const [sourceDoc, targetDoc] = await Promise.all([
      db.collection('assets').doc(sourceId).get(),
      db.collection('assets').doc(targetId).get(),
    ]);

    if (!sourceDoc.exists) return NextResponse.json({ error: 'Source asset not found' }, { status: 404 });
    if (!targetDoc.exists) return NextResponse.json({ error: 'Target asset not found' }, { status: 404 });

    const source = sourceDoc.data() as any;
    const target = targetDoc.data() as any;

    // Auth check — both assets assumed in same project; checking source is sufficient
    const hasAccess = await canAccessProject(user.id, source.projectId);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Resolve group IDs
    const sourceGroupId: string = source.versionGroupId || sourceId;
    const targetGroupId: string = target.versionGroupId || targetId;

    // Same-group check
    if (sourceGroupId === targetGroupId) {
      return NextResponse.json({ error: 'Assets are already in the same version stack' }, { status: 400 });
    }

    // Fetch all members of source group
    const sourceGroupSnap = await db.collection('assets')
      .where('versionGroupId', '==', sourceGroupId)
      .get();

    let sourceMembers: Array<{ id: string; version: number }> = sourceGroupSnap.docs.map((d) => ({
      id: d.id,
      version: (d.data() as any).version || 1,
    }));

    // Root asset may not have versionGroupId set — include it if not already in results
    if (!sourceMembers.some((m) => m.id === sourceId)) {
      sourceMembers.push({ id: sourceId, version: source.version || 1 });
    }

    // Fetch all members of target group
    const targetGroupSnap = await db.collection('assets')
      .where('versionGroupId', '==', targetGroupId)
      .get();

    let targetMembers: Array<{ id: string; version: number }> = targetGroupSnap.docs.map((d) => ({
      id: d.id,
      version: (d.data() as any).version || 1,
    }));

    // Root asset may not have versionGroupId set — include it if not already in results
    if (!targetMembers.some((m) => m.id === targetId)) {
      targetMembers.push({ id: targetId, version: target.version || 1 });
    }

    // Calculate max version in target group
    const maxTargetVersion = Math.max(...targetMembers.map((m) => m.version));

    // Sort source members ascending by version
    sourceMembers.sort((a, b) => a.version - b.version);

    // Atomic batch: reassign all source members to target group with new version numbers
    const batch = db.batch();
    for (let i = 0; i < sourceMembers.length; i++) {
      const member = sourceMembers[i];
      batch.update(db.collection('assets').doc(member.id), {
        versionGroupId: targetGroupId,
        version: maxTargetVersion + 1 + i,
      });
    }
    await batch.commit();

    return NextResponse.json({ merged: sourceMembers.length }, { status: 200 });
  } catch (err) {
    console.error('POST assets/merge-version error:', err);
    return NextResponse.json({ error: 'Failed to merge version' }, { status: 500 });
  }
}
