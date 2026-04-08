import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { getPublicUrl } from '@/lib/gcs';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { assetId, width, height, duration, frameRate, thumbnailGcsPath } = await request.json();
    if (!assetId) return NextResponse.json({ error: 'assetId required' }, { status: 400 });

    const db = getAdminDb();
    const doc = await db.collection('assets').doc(assetId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });

    const asset = doc.data() as any;
    if (asset.uploadedBy !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updates: Record<string, unknown> = { status: 'ready' };
    if (width) updates.width = width;
    if (height) updates.height = height;
    if (duration) updates.duration = duration;
    if (frameRate) updates.frameRate = frameRate;
    if (thumbnailGcsPath) {
      updates.thumbnailUrl = getPublicUrl(thumbnailGcsPath);
      updates.thumbnailGcsPath = thumbnailGcsPath;
    }

    await db.collection('assets').doc(assetId).update(updates);

    const updated = await db.collection('assets').doc(assetId).get();
    return NextResponse.json({ asset: { id: assetId, ...updated.data() } });
  } catch (error) {
    console.error('Upload complete error:', error);
    return NextResponse.json({ error: 'Failed to complete upload' }, { status: 500 });
  }
}
