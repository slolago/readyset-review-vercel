import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { getPublicUrl } from '@/lib/gcs';
import { canUpload } from '@/lib/permissions';
import type { Project } from '@/types';

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
    // Two gates: (1) platform/project role must allow upload; (2) the user who
    // reserved the signed URL (uploadedBy) must be the one calling complete.
    const projDoc = await db.collection('projects').doc(asset.projectId).get();
    if (!projDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const project = { id: projDoc.id, ...projDoc.data() } as Project;
    if (!canUpload(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
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

    // For image assets: if client didn't provide width/height, fall back to
    // server-side extraction from the GCS object header.
    if (asset.type === 'image') {
      const hasDims = typeof updates.width === 'number' && typeof updates.height === 'number';
      if (!hasDims && asset.gcsPath) {
        const { extractImageMetadata } = await import('@/lib/image-metadata');
        const meta = await extractImageMetadata(asset.gcsPath);
        if (meta?.width) updates.width = meta.width;
        if (meta?.height) updates.height = meta.height;
      }
      // Images do not go through ffprobe — mark probed:true so UI hides Probe button.
      updates.probed = true;
    }

    await db.collection('assets').doc(assetId).update(updates);

    const updated = await db.collection('assets').doc(assetId).get();

    // Fire-and-forget: run ffprobe to replace client-extracted metadata
    // with server-verified values. We don't block the upload-complete response
    // on it — the client already has acceptable metadata to start viewing.
    // If probe fails, the Probe button in the info panel can be used manually.
    const origin = request.nextUrl.origin;
    const authHeader = request.headers.get('Authorization');
    if (asset.type === 'video' && authHeader) {
      fetch(`${origin}/api/assets/${assetId}/probe`, {
        method: 'POST',
        headers: { Authorization: authHeader },
      }).catch((e) => console.warn('[upload/complete] background probe failed', e));
    }

    return NextResponse.json({ asset: { id: assetId, ...updated.data() } });
  } catch (error) {
    console.error('Upload complete error:', error);
    return NextResponse.json({ error: 'Failed to complete upload' }, { status: 500 });
  }
}
