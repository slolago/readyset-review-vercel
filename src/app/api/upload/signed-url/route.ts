import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, canAccessProject } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { generateUploadSignedUrl, buildGcsPath, buildThumbnailPath, getPublicUrl } from '@/lib/gcs';
import { getAssetType } from '@/lib/utils';
import { Timestamp } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { filename, contentType, size, projectId, folderId, parentAssetId } = await request.json();

    if (!filename || !contentType || !projectId) {
      return NextResponse.json({ error: 'filename, contentType, projectId required' }, { status: 400 });
    }

    const assetType = getAssetType(contentType);
    if (!assetType) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }

    const hasAccess = await canAccessProject(user.id, projectId);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const assetId = randomUUID();
    const gcsPath = buildGcsPath(projectId, assetId, filename);
    const signedUrl = await generateUploadSignedUrl(gcsPath, contentType);
    const publicUrl = getPublicUrl(gcsPath);

    const db = getAdminDb();

    // Versioning logic
    let versionNumber = 1;
    let versionGroupId = assetId; // V1: the asset is its own group root

    // Helper: given a group root ID, get the max version number in that group
    const getMaxVersionInGroup = async (groupId: string, parentVersion: number) => {
      const groupSnap = await db.collection('assets').where('versionGroupId', '==', groupId).get();
      return groupSnap.docs.reduce((max, d) => {
        const v = (d.data() as any).version || 1;
        return v > max ? v : max;
      }, parentVersion);
    };

    if (parentAssetId) {
      // Explicit "upload new version" — use the provided parent
      const parentDoc = await db.collection('assets').doc(parentAssetId).get();
      if (parentDoc.exists) {
        const parent = parentDoc.data() as any;
        const groupId = parent.versionGroupId || parentAssetId;
        const maxVersion = await getMaxVersionInGroup(groupId, parent.version || 1);
        versionNumber = maxVersion + 1;
        versionGroupId = groupId;
      }
    } else {
      // Auto-version: check if an asset with the same filename exists in the same folder
      const allSnap = await db.collection('assets').where('projectId', '==', projectId).get();
      const allAssets = allSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
      const folderMatch = (folderId || null);
      const existing = allAssets.filter(
        (a) => a.name === filename && (a.folderId ?? null) === folderMatch && a.status !== 'uploading'
      );

      if (existing.length > 0) {
        // Pick the one with the highest version number as the representative
        existing.sort((a, b) => (b.version || 1) - (a.version || 1));
        const parent = existing[0];
        const groupId = parent.versionGroupId || parent.id;
        const maxVersion = await getMaxVersionInGroup(groupId, parent.version || 1);
        versionNumber = maxVersion + 1;
        versionGroupId = groupId;
      }
    }

    await db.collection('assets').doc(assetId).set({
      projectId,
      folderId: folderId || null,
      name: filename,
      type: assetType,
      mimeType: contentType,
      url: publicUrl,
      gcsPath,
      thumbnailUrl: '',
      size: size || 0,
      uploadedBy: user.id,
      status: 'uploading',
      version: versionNumber,
      versionGroupId,
      createdAt: Timestamp.now(),
    });

    if (assetType === 'video') {
      const thumbnailGcsPath = buildThumbnailPath(projectId, assetId);
      const thumbnailSignedUrl = await generateUploadSignedUrl(thumbnailGcsPath, 'image/jpeg');
      return NextResponse.json({ signedUrl, assetId, gcsPath, thumbnailSignedUrl, thumbnailGcsPath });
    }

    return NextResponse.json({ signedUrl, assetId, gcsPath });
  } catch (error) {
    console.error('Signed URL error:', error);
    return NextResponse.json({ error: 'Failed to generate signed URL' }, { status: 500 });
  }
}
