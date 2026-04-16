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

    // Get assets — branch on selection-scoped vs folder/project-scoped
    let assets: any[];
    let folders: any[] = [];

    if (link.assetIds && link.assetIds.length > 0) {
      // Selection-scoped link — fetch by individual doc IDs (Firestore `in` capped at 30)
      const docs = await Promise.all(
        (link.assetIds as string[]).map((id: string) => db.collection('assets').doc(id).get())
      );
      assets = (
        await Promise.all(
          docs.map(async (d) => {
            if (!d.exists) return { id: d.id, _deleted: true };
            const asset = { id: d.id, ...d.data() } as any;
            if (asset.status !== 'ready') return null;
            if (asset.gcsPath) {
              try { asset.signedUrl = await generateReadSignedUrl(asset.gcsPath); } catch {}
            }
            if (asset.thumbnailGcsPath) {
              try { asset.thumbnailSignedUrl = await generateReadSignedUrl(asset.thumbnailGcsPath); } catch {}
            }
            if (asset.gcsPath && link.allowDownloads) {
              try { asset.downloadUrl = await generateDownloadSignedUrl(asset.gcsPath, asset.name); } catch {}
            }
            return asset;
          })
        )
      ).filter(Boolean);
      // If showAllVersions, expand selection to include all versions in each asset's group
      if (link.showAllVersions) {
        const groupIds = new Set<string>();
        for (const a of assets) {
          if (a.versionGroupId) groupIds.add(a.versionGroupId);
        }
        if (groupIds.size > 0) {
          const groupAssets = await Promise.all(
            Array.from(groupIds).map(async (gid) => {
              const snap = await db.collection('assets')
                .where('versionGroupId', '==', gid)
                .where('status', '==', 'ready')
                .get();
              return Promise.all(snap.docs.map(async (d) => {
                const a = { id: d.id, ...d.data() } as any;
                if (a.gcsPath) { try { a.signedUrl = await generateReadSignedUrl(a.gcsPath); } catch {} }
                if (a.thumbnailGcsPath) { try { a.thumbnailSignedUrl = await generateReadSignedUrl(a.thumbnailGcsPath); } catch {} }
                if (a.gcsPath && link.allowDownloads) { try { a.downloadUrl = await generateDownloadSignedUrl(a.gcsPath, a.name); } catch {} }
                return a;
              }));
            })
          );
          const existing = new Set(assets.map((a: any) => a.id));
          for (const group of groupAssets) {
            for (const a of group) {
              if (!existing.has(a.id)) { assets.push(a); existing.add(a.id); }
            }
          }
        }
      }
      // folders stays []
    } else {
      // Existing folder/project-scoped path
      let assetsQuery = db.collection('assets').where('projectId', '==', link.projectId).where('status', '==', 'ready');
      if (link.folderId) {
        assetsQuery = assetsQuery.where('folderId', '==', link.folderId) as any;
      }
      const assetsSnap = await assetsQuery.get();
      const assetsWithUrls = await Promise.all(
        assetsSnap.docs.map(async (d) => {
          const asset = { id: d.id, ...d.data() } as any;
          if (asset.gcsPath) {
            try { asset.signedUrl = await generateReadSignedUrl(asset.gcsPath); } catch {}
          }
          if (asset.thumbnailGcsPath) {
            try { asset.thumbnailSignedUrl = await generateReadSignedUrl(asset.thumbnailGcsPath); } catch {}
          }
          if (asset.gcsPath && link.allowDownloads) {
            try { asset.downloadUrl = await generateDownloadSignedUrl(asset.gcsPath, asset.name); } catch {}
          }
          return asset;
        })
      );

      // Group by versionGroupId
      const groups = new Map<string, any[]>();
      for (const asset of assetsWithUrls) {
        const groupId = asset.versionGroupId || asset.id;
        if (!groups.has(groupId)) groups.set(groupId, []);
        groups.get(groupId)!.push(asset);
      }

      if (link.showAllVersions) {
        // Show every version as its own card, sorted newest-first within each group
        assets = Array.from(groups.values()).flatMap((group) => {
          const sorted = group.sort((a, b) => (b.version || 1) - (a.version || 1));
          return sorted.map((v) => ({ ...v, _versionCount: group.length }));
        });
      } else {
        // Default: only latest version per group
        assets = Array.from(groups.values()).map((group) => {
          const sorted = group.sort((a, b) => (b.version || 1) - (a.version || 1));
          return { ...sorted[0], _versionCount: group.length };
        });
      }

      // Get folders for folder/project-scoped links
      let foldersQuery = db.collection('folders').where('projectId', '==', link.projectId);
      if (link.folderId) {
        foldersQuery = foldersQuery.where('parentId', '==', link.folderId) as any;
      } else {
        foldersQuery = foldersQuery.where('parentId', '==', null) as any;
      }
      const foldersSnap = await foldersQuery.get();
      folders = foldersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

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
