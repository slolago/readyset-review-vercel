import type { Firestore } from 'firebase-admin/firestore';

export type RenameValidation =
  | { ok: true; trimmed: string }
  | { ok: false; code: 'EMPTY_NAME' | 'NAME_COLLISION' };

/**
 * Validate an asset rename against sibling name collision.
 *
 * - Trims newName; returns EMPTY_NAME if empty after trim.
 * - No-op rename (trimmed === current name) is always ok.
 * - Queries siblings by projectId + folderId; excludes self; excludes soft-deleted.
 * - Returns NAME_COLLISION on case-insensitive name match.
 */
export async function validateAssetRename(
  db: Firestore,
  assetId: string,
  newName: string
): Promise<RenameValidation> {
  const trimmed = newName.trim();
  if (!trimmed) return { ok: false, code: 'EMPTY_NAME' };

  const selfDoc = await db.collection('assets').doc(assetId).get();
  if (!selfDoc.exists) return { ok: true, trimmed };
  const self = selfDoc.data() as any;
  if (self.name === trimmed) return { ok: true, trimmed };

  const siblingsSnap = await db
    .collection('assets')
    .where('projectId', '==', self.projectId)
    .where('folderId', '==', self.folderId ?? null)
    .get();
  const target = trimmed.toLowerCase();
  const collision = siblingsSnap.docs.some((d) => {
    if (d.id === assetId) return false;
    const data = d.data() as any;
    if (data.deletedAt) return false;
    return String(data.name ?? '').toLowerCase() === target;
  });
  if (collision) return { ok: false, code: 'NAME_COLLISION' };
  return { ok: true, trimmed };
}

/**
 * Validate a folder rename against sibling name collision.
 *
 * Same shape as validateAssetRename but scopes siblings by projectId + parentId
 * (parentId may be null for root folders).
 */
export async function validateFolderRename(
  db: Firestore,
  folderId: string,
  newName: string
): Promise<RenameValidation> {
  const trimmed = newName.trim();
  if (!trimmed) return { ok: false, code: 'EMPTY_NAME' };

  const selfDoc = await db.collection('folders').doc(folderId).get();
  if (!selfDoc.exists) return { ok: true, trimmed };
  const self = selfDoc.data() as any;
  if (self.name === trimmed) return { ok: true, trimmed };

  const siblingsSnap = await db
    .collection('folders')
    .where('projectId', '==', self.projectId)
    .where('parentId', '==', self.parentId ?? null)
    .get();
  const target = trimmed.toLowerCase();
  const collision = siblingsSnap.docs.some((d) => {
    if (d.id === folderId) return false;
    const data = d.data() as any;
    if (data.deletedAt) return false;
    return String(data.name ?? '').toLowerCase() === target;
  });
  if (collision) return { ok: false, code: 'NAME_COLLISION' };
  return { ok: true, trimmed };
}
