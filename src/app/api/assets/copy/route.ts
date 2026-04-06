import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, canAccessProject } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { assetId, targetFolderId, name } = await request.json();
    if (!assetId) return NextResponse.json({ error: 'assetId required' }, { status: 400 });

    const db = getAdminDb();
    const doc = await db.collection('assets').doc(assetId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const source = doc.data() as any;
    const hasAccess = await canAccessProject(user.id, source.projectId);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // targetFolderId may be null (project root) or a folder id; if omitted default to same folder
    const destinationFolderId = targetFolderId !== undefined ? targetFolderId : source.folderId;

    // Build the new document — same binary, new metadata record
    // A copy always starts as version 1 in a new version group (it is independent of the source's group)
    const newRef = db.collection('assets').doc();
    const copyData = {
      ...source,
      id: newRef.id,
      folderId: destinationFolderId,
      name: name ?? `Copy of ${source.name}`,
      version: 1,
      versionGroupId: newRef.id, // new independent group
      createdAt: Timestamp.now(),
      uploadedBy: user.id,
    };
    // Remove the id field — Firestore stores it as the document key, not a field
    delete copyData.id;

    await newRef.set(copyData);
    return NextResponse.json({ asset: { id: newRef.id, ...copyData } }, { status: 201 });
  } catch (err) {
    console.error('POST assets/copy error:', err);
    return NextResponse.json({ error: 'Failed to copy asset' }, { status: 500 });
  }
}
