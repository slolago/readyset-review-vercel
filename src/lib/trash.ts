/**
 * Hard-delete helpers used by the Trash endpoints.
 *
 * These are the destructive operations — they remove GCS blobs, cascade
 * into comments/descendants, and delete Firestore docs. The soft-delete
 * DELETE endpoints never call into these; only /api/trash/permanent-delete
 * and /api/trash/empty do.
 *
 * Kept in src/lib/ rather than a route file because Next.js 14 route modules
 * only permit HTTP-method exports.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { deleteFile } from '@/lib/gcs';

const BATCH_LIMIT = 400;

/** Hard-delete a single asset: GCS blobs + comments + Firestore doc. No-op if missing. */
export async function hardDeleteAsset(db: Firestore, assetId: string): Promise<void> {
  const doc = await db.collection('assets').doc(assetId).get();
  if (!doc.exists) return;
  const asset = doc.data() as any;

  await Promise.all([
    asset.gcsPath ? deleteFile(asset.gcsPath).catch(console.error) : null,
    asset.thumbnailGcsPath ? deleteFile(asset.thumbnailGcsPath).catch(console.error) : null,
    asset.spriteStripGcsPath ? deleteFile(asset.spriteStripGcsPath).catch(console.error) : null,
  ]);

  const commentsSnap = await db.collection('comments').where('assetId', '==', assetId).get();
  for (let i = 0; i < commentsSnap.docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    commentsSnap.docs.slice(i, i + BATCH_LIMIT).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  await db.collection('assets').doc(assetId).delete();
}

/**
 * Hard-delete a folder and EVERY descendant: all sub-folder docs + every asset
 * (and that asset's GCS blobs + comments) inside any descendant folder.
 */
export async function hardDeleteFolder(db: Firestore, folderId: string): Promise<void> {
  // BFS collect all descendant folder IDs (including root)
  const toDelete: string[] = [folderId];
  const queue: string[] = [folderId];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const children = await db.collection('folders').where('parentId', '==', parentId).get();
    for (const child of children.docs) {
      toDelete.push(child.id);
      queue.push(child.id);
    }
  }

  // Hard-delete every asset in any of those folders (cascades comments + GCS)
  for (const fid of toDelete) {
    const assetsSnap = await db.collection('assets').where('folderId', '==', fid).get();
    for (const a of assetsSnap.docs) {
      await hardDeleteAsset(db, a.id);
    }
  }

  // Delete folder docs (batched)
  for (let i = 0; i < toDelete.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    toDelete.slice(i, i + BATCH_LIMIT).forEach((id) => batch.delete(db.collection('folders').doc(id)));
    await batch.commit();
  }
}
