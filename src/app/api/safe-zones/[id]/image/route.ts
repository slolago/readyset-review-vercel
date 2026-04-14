import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { uploadBuffer, deleteFile } from '@/lib/gcs';
import { Storage } from '@google-cloud/storage';

function getStorage() {
  return new Storage({
    projectId: process.env.GCS_PROJECT_ID,
    credentials: {
      client_email: process.env.GCS_CLIENT_EMAIL,
      private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
  });
}

/** GET — proxy the custom safe zone image from GCS (no auth needed). */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getAdminDb();
    const snap = await db.collection('safeZones').doc(params.id).get();
    if (!snap.exists) return new NextResponse('Not found', { status: 404 });

    const data = snap.data()!;
    if (!data.gcsPath) return new NextResponse('No custom image', { status: 404 });

    const storage = getStorage();
    const file = storage.bucket(process.env.GCS_BUCKET_NAME!).file(data.gcsPath);
    const [buffer] = await file.download();

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch (err) {
    console.error('[safe-zones image GET]', err);
    return new NextResponse('Failed to fetch image', { status: 500 });
  }
}

/** POST — upload/replace image for a safe zone (admin only). */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const db = getAdminDb();
    const ref = db.collection('safeZones').doc(params.id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const data = snap.data()!;
    const formData = await request.formData();
    const file = formData.get('image') as File | null;
    if (!file) return NextResponse.json({ error: 'image file required' }, { status: 400 });

    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: 'Only PNG, JPEG, WebP or GIF allowed' }, { status: 400 });
    }

    const ext = file.type === 'image/png' ? 'png'
      : file.type === 'image/jpeg' ? 'jpg'
      : file.type === 'image/webp' ? 'webp'
      : 'gif';

    const gcsPath = `safezones/${params.id}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Delete old custom image if it exists and has a different path
    if (data.gcsPath && data.gcsPath !== gcsPath) {
      await deleteFile(data.gcsPath).catch(() => {});
    }

    await uploadBuffer(gcsPath, buffer, file.type);

    const imageUrl = `/api/safe-zones/${params.id}/image`;
    await ref.update({ gcsPath, imageUrl });

    return NextResponse.json({ imageUrl });
  } catch (err) {
    console.error('[safe-zones image POST]', err);
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
  }
}
