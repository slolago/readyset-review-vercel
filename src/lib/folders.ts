import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';

export interface DeepCopyCounts {
  folders: number;
  assets: number;
}

/**
 * Deep-copy a folder subtree. Creates a new root folder under dstParentId, then BFS
 * through subfolders, re-parenting each copy under its newly-created parent. Skips
 * soft-deleted folders and assets (SDC alignment).
 *
 * Per-level parallelism: within each BFS level we Promise.all the per-folder work
 * (asset copy + subfolder enumeration) so a wide tree doesn't pay N serial round-trips.
 * Across levels we still need ordering (children need their parent's id).
 *
 * Reuses the copy shape inline — NOT calling the /api/assets/copy route, to stay
 * server-side and avoid an auth/http hop.
 */
export async function deepCopyFolder(
  db: Firestore,
  srcFolderId: string,
  dstParentId: string | null,
  projectId: string,
  userId: string,
  overrideName?: string,
): Promise<{ newRootId: string; counts: DeepCopyCounts }> {
  const srcRoot = await db.collection('folders').doc(srcFolderId).get();
  if (!srcRoot.exists) throw new Error('Source folder not found');
  const rootData = srcRoot.data() as any;

  // Compute path for the destination root
  let dstRootPath: string[] = [];
  if (dstParentId) {
    const p = await db.collection('folders').doc(dstParentId).get();
    if (p.exists) dstRootPath = [...(((p.data() as any).path as string[]) || []), dstParentId];
  }

  // Create new root folder
  const newRootRef = db.collection('folders').doc();
  await newRootRef.set({
    name: overrideName ?? rootData.name,
    projectId,
    parentId: dstParentId ?? null,
    path: dstRootPath,
    createdAt: Timestamp.now(),
    // Phase 63 (IDX-03): explicit null so the composite-indexed listing query
    // at GET /api/folders (deletedAt == null) surfaces this new folder.
    deletedAt: null,
  });

  let folderCount = 1;
  let assetCount = 0;

  // Each BFS level entry: { srcId, dstId, dstPath }
  interface LevelNode { srcId: string; dstId: string; dstPath: string[] }
  let level: LevelNode[] = [
    { srcId: srcFolderId, dstId: newRootRef.id, dstPath: dstRootPath },
  ];

  while (level.length) {
    // Process every folder in the current level in parallel. For each, we:
    //   1. Copy assets belonging to it (grouped by versionGroupId, fresh group ids)
    //   2. Enumerate live subfolders, create their destination docs, enqueue them
    const perFolderResults = await Promise.all(
      level.map(async ({ srcId, dstId, dstPath }) => {
        // ─── Assets ────────────────────────────────────────────────────────
        const assetsSnap = await db.collection('assets').where('folderId', '==', srcId).get();
        const liveAssets = assetsSnap.docs.filter((d) => !(d.data() as any).deletedAt);

        // Group by versionGroupId so each stack gets a fresh newGroupId
        const groups = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
        for (const d of liveAssets) {
          const data = d.data() as any;
          const gid = data.versionGroupId || d.id;
          if (!groups.has(gid)) groups.set(gid, []);
          groups.get(gid)!.push(d);
        }

        let localAssetCount = 0;
        // Firestore batch limit is 500 writes; cap at 400 for safety
        let batch = db.batch();
        let inBatch = 0;
        const flush = async () => {
          if (inBatch > 0) {
            await batch.commit();
            batch = db.batch();
            inBatch = 0;
          }
        };

        for (const members of Array.from(groups.values())) {
          const newGroupId = db.collection('assets').doc().id;
          for (const d of members) {
            const data = d.data() as any;
            const newRef = db.collection('assets').doc();
            const copyData: any = {
              ...data,
              folderId: dstId,
              versionGroupId: newGroupId,
              createdAt: Timestamp.now(),
              uploadedBy: userId,
            };
            delete copyData.id;
            delete copyData.deletedAt;
            delete copyData.deletedBy;
            batch.set(newRef, copyData);
            inBatch++;
            localAssetCount++;
            if (inBatch >= 400) await flush();
          }
        }
        await flush();

        // ─── Subfolders ────────────────────────────────────────────────────
        const subSnap = await db.collection('folders').where('parentId', '==', srcId).get();
        const childNodes: LevelNode[] = [];
        const childCreates: Promise<unknown>[] = [];
        for (const sub of subSnap.docs) {
          const subData = sub.data() as any;
          if (subData.deletedAt) continue;
          const newSubRef = db.collection('folders').doc();
          const newSubPath = [...dstPath, dstId];
          childCreates.push(
            newSubRef.set({
              name: subData.name,
              projectId,
              parentId: dstId,
              path: newSubPath,
              createdAt: Timestamp.now(),
              deletedAt: null, // Phase 63 (IDX-03): see root-folder comment above.
            }),
          );
          childNodes.push({ srcId: sub.id, dstId: newSubRef.id, dstPath: newSubPath });
        }
        await Promise.all(childCreates);

        return { assetCount: localAssetCount, childNodes };
      }),
    );

    const nextLevel: LevelNode[] = [];
    for (const { assetCount: a, childNodes } of perFolderResults) {
      assetCount += a;
      folderCount += childNodes.length;
      nextLevel.push(...childNodes);
    }
    level = nextLevel;
  }

  return { newRootId: newRootRef.id, counts: { folders: folderCount, assets: assetCount } };
}
