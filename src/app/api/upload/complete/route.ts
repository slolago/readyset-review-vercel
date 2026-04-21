import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { getPublicUrl, verifyGcsObject } from '@/lib/gcs';
import { canUpload } from '@/lib/permissions';
import { isAcceptedMime } from '@/lib/file-types';
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

    // OBS-04: verify the GCS object actually landed before we flip status to
    // 'ready'. A cancelled or failed PUT leaves the asset doc around with a
    // gcsPath but no object (or a zero-byte placeholder) — mark it broken.
    if (!asset.gcsPath) {
      return NextResponse.json({ error: 'Asset has no gcsPath' }, { status: 400 });
    }
    const verify = await verifyGcsObject(asset.gcsPath);
    if (!verify.exists || verify.size === 0) {
      return NextResponse.json(
        { error: verify.exists ? 'Upload is zero bytes — cancelled or failed' : 'GCS object not found' },
        { status: 400 },
      );
    }

    // SEC-23: server-side MIME allow-list. If GCS reports a real content-type,
    // it must be on the accepted list. If GCS reports nothing or
    // application/octet-stream (some browsers omit the header on signed PUTs),
    // fall back to the mimeType recorded at signed-url creation time.
    const gcsMime = verify.contentType;
    const fallbackMime = typeof asset.mimeType === 'string' ? asset.mimeType : null;
    const shouldFallback = !gcsMime || gcsMime.toLowerCase() === 'application/octet-stream';
    const mimeForCheck = shouldFallback ? fallbackMime : gcsMime;
    if (!isAcceptedMime(mimeForCheck)) {
      return NextResponse.json(
        { error: `Unsupported MIME type${mimeForCheck ? `: ${mimeForCheck}` : ''}` },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = { status: 'ready', size: verify.size };
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
    } else if (asset.type === 'video') {
      // CLN-07: any client-provided width/height/duration/frameRate here are
      // provisional — the authoritative values come from the async ffprobe
      // fired below. Explicitly mark probed:false so consumers (export, sprite,
      // viewer aspect) can differentiate "no probe yet" from "probe complete
      // but no dims" and surface a pending-probe UX in the ~10-30s window.
      // The probe endpoint flips this to true on success.
      updates.probed = false;
    }

    await db.collection('assets').doc(assetId).update(updates);

    const updated = await db.collection('assets').doc(assetId).get();

    // Fire-and-forget background jobs for video assets:
    //   - probe:  server-verified ffprobe metadata (replaces client-extracted values)
    //   - sprite: hover-scrub filmstrip (so the first user to hover doesn't
    //             wait for on-demand generation)
    // Both run in parallel, neither blocks the upload-complete response. If
    // either fails, manual fallbacks exist (Probe button, on-demand sprite
    // endpoint triggered by hover).
    const origin = request.nextUrl.origin;
    const authHeader = request.headers.get('Authorization');
    if (asset.type === 'video' && authHeader) {
      fetch(`${origin}/api/assets/${assetId}/probe`, {
        method: 'POST',
        headers: { Authorization: authHeader },
      }).catch((e) => console.warn('[upload/complete] background probe failed', e));

      fetch(`${origin}/api/assets/${assetId}/generate-sprite`, {
        method: 'POST',
        headers: { Authorization: authHeader },
      }).catch((e) => console.warn('[upload/complete] background sprite failed', e));
    }

    return NextResponse.json({ asset: { id: assetId, ...updated.data() } });
  } catch (error) {
    console.error('Upload complete error:', error);
    return NextResponse.json({ error: 'Failed to complete upload' }, { status: 500 });
  }
}
