import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { canUpload } from '@/lib/permissions';
import type { Project } from '@/types';
import { generateUploadSignedUrl, buildGcsPath } from '@/lib/gcs';
import { classify, extFromName } from '@/lib/file-types';
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

    const ext = extFromName(filename);
    const meta = classify(contentType, ext);
    if (!meta) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }

    const db = getAdminDb();
    const projDoc = await db.collection('projects').doc(projectId).get();
    if (!projDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const project = { id: projDoc.id, ...projDoc.data() } as Project;
    if (!canUpload(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const assetId = randomUUID();
    const gcsPath = buildGcsPath(projectId, assetId, filename);
    const signedUrl = await generateUploadSignedUrl(gcsPath, contentType);
    const folderMatch = folderId || null;

    // Transaction scoped to (projectId, folderId, filename):
    // 1. TXN-04: validate folderId is live (not soft-deleted, not missing)
    // 2. TXN-03: auto-version name-collision scan + next-version compute + write doc
    // All reads happen before any writes (Firestore rule).
    try {
      await db.runTransaction(async (tx) => {
        // TXN-04: folderId live-check (inside tx so a concurrent soft-delete is caught)
        if (folderMatch) {
          const folderSnap = await tx.get(db.collection('folders').doc(folderMatch));
          if (!folderSnap.exists) {
            throw new Error('FOLDER_NOT_FOUND');
          }
          const folderData = folderSnap.data() as any;
          if (folderData?.deletedAt) {
            throw new Error('FOLDER_NOT_FOUND');
          }
        }

        let versionNumber = 1;
        let versionGroupId = assetId; // V1: the asset is its own group root

        // Helper: given a group root ID, compute max version in that group via tx.
        const getMaxVersionInGroupTx = async (groupId: string, parentVersion: number) => {
          const groupQuery = db.collection('assets').where('versionGroupId', '==', groupId);
          const groupSnap = await tx.get(groupQuery);
          return groupSnap.docs.reduce((max, d) => {
            const v = (d.data() as any).version || 1;
            return v > max ? v : max;
          }, parentVersion);
        };

        if (parentAssetId) {
          // Explicit "upload new version" — use the provided parent
          const parentDoc = await tx.get(db.collection('assets').doc(parentAssetId));
          if (parentDoc.exists) {
            const parent = parentDoc.data() as any;
            const groupId = parent.versionGroupId || parentAssetId;
            const maxVersion = await getMaxVersionInGroupTx(groupId, parent.version || 1);
            versionNumber = maxVersion + 1;
            versionGroupId = groupId;
          }
        } else {
          // Auto-version: scan project assets for a same-folder same-name collision.
          // Scoped query by projectId (existing pattern — avoids a new composite index);
          // folder + name + status filters applied in-memory on the tx-read snapshot.
          const projectQuery = db.collection('assets').where('projectId', '==', projectId);
          const allSnap = await tx.get(projectQuery);
          const existing = allSnap.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) }))
            .filter(
              (a: any) =>
                a.name === filename &&
                (a.folderId ?? null) === folderMatch &&
                a.status !== 'uploading'
            );

          if (existing.length > 0) {
            // Pick the one with the highest version number as the representative
            existing.sort((a: any, b: any) => (b.version || 1) - (a.version || 1));
            const parent: any = existing[0];
            const groupId = parent.versionGroupId || parent.id;
            const maxVersion = await getMaxVersionInGroupTx(groupId, parent.version || 1);
            versionNumber = maxVersion + 1;
            versionGroupId = groupId;
          }
        }

        // All reads complete — now the single write.
        tx.set(db.collection('assets').doc(assetId), {
          projectId,
          folderId: folderMatch,
          name: filename,
          type: meta.type,
          subtype: meta.subtype,
          mimeType: contentType,
          gcsPath,
          thumbnailUrl: '',
          size: size || 0,
          uploadedBy: user.id,
          status: 'uploading',
          version: versionNumber,
          versionGroupId,
          createdAt: Timestamp.now(),
          // Phase 63 (IDX-02): denormalized comment count. Kept in sync via
          // transactional increment/decrement in the comments POST/DELETE routes.
          commentCount: 0,
          // Phase 63 (IDX-01): explicit null so composite-indexed queries
          // that filter on deletedAt discover this asset.
          deletedAt: null,
        });
      });
    } catch (txErr: any) {
      if (txErr?.message === 'FOLDER_NOT_FOUND') {
        return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
      }
      throw txErr;
    }

    return NextResponse.json({ signedUrl, assetId, gcsPath });
  } catch (error) {
    console.error('Signed URL error:', error);
    return NextResponse.json({ error: 'Failed to generate signed URL' }, { status: 500 });
  }
}
