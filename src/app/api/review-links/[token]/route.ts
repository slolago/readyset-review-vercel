import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { generateReadSignedUrl, generateDownloadSignedUrl } from '@/lib/gcs';

interface RouteParams {
  params: { token: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const db = getAdminDb();
    const { searchParams } = new URL(request.url);
    const providedPassword = searchParams.get('password');

    // Find the review link — use direct doc lookup (token IS the doc ID)
    const doc = await db.collection('reviewLinks').doc(params.token).get();

    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const link = { id: doc.id, ...doc.data() } as any;

    // Check expiry
    if (link.expiresAt) {
      const expiresAt = link.expiresAt as Timestamp;
      if (expiresAt.toMillis() < Date.now()) {
        return NextResponse.json({ error: 'This review link has expired' }, { status: 410 });
      }
    }

    // Check password
    if (link.password) {
      if (!providedPassword || providedPassword !== link.password) {
        return NextResponse.json({ error: 'Password required' }, { status: 401 });
      }
    }

    // Get project info
    const projectDoc = await db.collection('projects').doc(link.projectId).get();
    const projectName = projectDoc.exists ? (projectDoc.data() as any).name : 'Unknown Project';

    // Get assets
    let assetsQuery = db.collection('assets').where('projectId', '==', link.projectId).where('status', '==', 'ready');
    if (link.folderId) {
      assetsQuery = assetsQuery.where('folderId', '==', link.folderId) as any;
    }
    const assetsSnap = await assetsQuery.get();
    const assets = await Promise.all(
      assetsSnap.docs.map(async (d) => {
        const asset = { id: d.id, ...d.data() } as any;
        if (asset.gcsPath) {
          try { asset.signedUrl = await generateReadSignedUrl(asset.gcsPath); } catch {}
        }
        if (asset.thumbnailPath) {
          try { asset.thumbnailSignedUrl = await generateReadSignedUrl(asset.thumbnailPath); } catch {}
        }
        if (asset.gcsPath && link.allowDownloads) {
          try { asset.downloadUrl = await generateDownloadSignedUrl(asset.gcsPath, asset.name); } catch {}
        }
        return asset;
      })
    );

    // Get folders
    let foldersQuery = db.collection('folders').where('projectId', '==', link.projectId);
    if (link.folderId) {
      foldersQuery = foldersQuery.where('parentId', '==', link.folderId) as any;
    } else {
      foldersQuery = foldersQuery.where('parentId', '==', null) as any;
    }
    const foldersSnap = await foldersQuery.get();
    const folders = foldersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Remove password from response
    const { password: _pw, ...safeLink } = link;

    return NextResponse.json({
      reviewLink: safeLink,
      assets,
      folders,
      projectName,
    });
  } catch (error) {
    console.error('Review link error:', error);
    return NextResponse.json({ error: 'Failed to load review link' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { getAdminAuth } = await import('@/lib/firebase-admin');
    const decoded = await getAdminAuth().verifyIdToken(authHeader.slice(7));

    const { name } = await request.json();
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'name required' }, { status: 400 });
    }

    const db = getAdminDb();
    const doc = await db.collection('reviewLinks').doc(params.token).get();

    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const link = doc.data() as any;
    if (link.createdBy !== decoded.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await doc.ref.update({ name: name.trim() });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update review link' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { getAdminAuth } = await import('@/lib/firebase-admin');
    const decoded = await getAdminAuth().verifyIdToken(authHeader.slice(7));

    const db = getAdminDb();
    const doc = await db.collection('reviewLinks').doc(params.token).get();

    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const link = doc.data() as any;
    if (link.createdBy !== decoded.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await doc.ref.delete();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete review link' }, { status: 500 });
  }
}
