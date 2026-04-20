import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { uploadBuffer, buildThumbnailPath, getPublicUrl } from '@/lib/gcs';
import { canUpload } from '@/lib/permissions';
import type { Project } from '@/types';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await request.formData();
    const assetId = formData.get('assetId');
    const thumbnailFile = formData.get('thumbnail');

    if (!assetId || typeof assetId !== 'string') {
      return NextResponse.json({ error: 'assetId required' }, { status: 400 });
    }
    if (!thumbnailFile || !(thumbnailFile instanceof Blob)) {
      return NextResponse.json({ error: 'thumbnail file required' }, { status: 400 });
    }

    // Verify the asset belongs to this user
    const db = getAdminDb();
    const doc = await db.collection('assets').doc(assetId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });

    const asset = doc.data() as any;
    // Any collaborator with upload rights can regenerate thumbnails/sprites.
    // Reviewers are blocked (read-only); platform-viewers are blocked.
    const projDoc = await db.collection('projects').doc(asset.projectId).get();
    if (!projDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const project = { id: projDoc.id, ...projDoc.data() } as Project;
    if (!canUpload(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const projectId = asset.projectId;
    const uploadType = formData.get('type') as string | null;

    if (uploadType === 'sprite') {
      // Sprite strip upload
      const spriteGcsPath = `projects/${projectId}/assets/${assetId}/sprite-strip.jpg`;
      const arrayBuffer = await thumbnailFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await uploadBuffer(spriteGcsPath, buffer, 'image/jpeg');
      const spriteUrl = getPublicUrl(spriteGcsPath);
      await db.collection('assets').doc(assetId).update({
        spriteStripUrl: spriteUrl,
        spriteStripGcsPath: spriteGcsPath,
      });
      return NextResponse.json({ spriteStripGcsPath: spriteGcsPath, spriteStripUrl: spriteUrl });
    }

    // Regular thumbnail upload
    const thumbnailGcsPath = buildThumbnailPath(projectId, assetId);

    // Upload thumbnail buffer directly to GCS (server-side — no CORS issues)
    const arrayBuffer = await thumbnailFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await uploadBuffer(thumbnailGcsPath, buffer, 'image/jpeg');

    const thumbnailUrl = getPublicUrl(thumbnailGcsPath);

    // Update the asset's thumbnailUrl and thumbnailGcsPath
    await db.collection('assets').doc(assetId).update({
      thumbnailUrl,
      thumbnailGcsPath,
    });

    return NextResponse.json({ thumbnailGcsPath, thumbnailUrl });
  } catch (error) {
    console.error('[thumbnail upload] error:', error);
    return NextResponse.json({ error: 'Failed to upload thumbnail' }, { status: 500 });
  }
}
