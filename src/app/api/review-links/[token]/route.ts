import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { generateDownloadSignedUrl } from '@/lib/gcs';
import { getOrCreateSignedUrl } from '@/lib/signed-url-cache';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import {
  assertReviewLinkActive,
  canEditReviewLink,
  canDeleteReviewLink,
  ReviewLinkDenied,
} from '@/lib/permissions';
import type { Project, ReviewLink } from '@/types';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { serializeReviewLink, hashPassword } from '@/lib/review-links';
import { extractReviewPassword } from '@/lib/review-password';
import { coerceToDate } from '@/lib/format-date';

interface RouteParams {
  params: { token: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const db = getAdminDb();
    const { searchParams } = new URL(request.url);
    // SEC-21: prefer x-review-password header; fall back to ?password= (deprecated).
    const providedPassword = extractReviewPassword(request) ?? null;
    const requestedFolderId = searchParams.get('folder') || null;

    // Find the review link — use direct doc lookup (token IS the doc ID)
    const doc = await db.collection('reviewLinks').doc(params.token).get();

    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const link = { id: doc.id, ...doc.data() } as any;

    // Expiry + password via shared assertion (maps to 410/401)
    try {
      const res = assertReviewLinkActive(link as ReviewLink, {
        providedPassword: providedPassword ?? undefined,
      });
      // SEC-20: transparent plaintext→bcrypt migration. Fire-and-forget so the
      // guest request isn't blocked on the rewrite.
      if (res.needsPasswordUpgrade && providedPassword) {
        const rehashed = hashPassword(providedPassword);
        db.collection('reviewLinks').doc(params.token).update({ password: rehashed })
          .catch((err) => console.warn('[review-links] password rehash failed', err));
      }
    } catch (e) {
      if (e instanceof ReviewLinkDenied) {
        if (e.reason === 'expired') {
          return NextResponse.json({ error: 'This review link has expired' }, { status: 410 });
        }
        if (e.reason === 'password') {
          return NextResponse.json({ error: 'Password required' }, { status: 401 });
        }
      }
      throw e;
    }

    // Get project info
    const projectDoc = await db.collection('projects').doc(link.projectId).get();
    const projectName = projectDoc.exists ? (projectDoc.data() as any).name : 'Unknown Project';

    // Determine the link's allowed folder roots. A requested ?folder=X is accepted if
    // it IS a root or descends (via parentId chain) from one.
    const editableRoots: string[] = Array.isArray(link.folderIds) && link.folderIds.length
      ? link.folderIds
      : (link.folderId ? [link.folderId] : []);
    const isProjectScoped = editableRoots.length === 0 && !(Array.isArray(link.assetIds) && link.assetIds.length);

    // Auto-drill: if the link's root is exactly ONE folder and no loose assets, treat it
    // as if the guest had requested that folder directly. Avoids the "one folder card"
    // dead-end UX and matches the familiar "share a folder" behavior.
    const looseAssetCount = Array.isArray(link.assetIds) ? link.assetIds.length : 0;
    const effectiveFolderRequest = requestedFolderId
      ?? (editableRoots.length === 1 && looseAssetCount === 0 ? editableRoots[0] : null);

    const folderIsAccessible = async (folderId: string): Promise<boolean> => {
      // CLN-05: use Folder.path[] (ancestor ids, already denormalized on the doc)
      // for O(1) ancestry: a single doc read, then a set-membership check.
      // Replaces the N sequential reads the old parentId walk required.
      const fs = await db.collection('folders').doc(folderId).get();
      if (!fs.exists) return false;
      const f = fs.data() as any;
      if (f.projectId !== link.projectId) return false;
      if (isProjectScoped) return true; // any folder in project is allowed
      if (editableRoots.includes(folderId)) return true;
      const path: string[] = Array.isArray(f.path) ? f.path : [];
      return path.some((ancestorId) => editableRoots.includes(ancestorId));
    };

    // Resolve uploader UIDs → display names in a single batched `getAll`,
    // attach as `uploadedByName` on each asset. Guest FileInfoPanel reads
    // this so the Info tab shows a real name instead of the raw Firebase
    // Auth UID (guests can't hit /api/users themselves — auth-gated).
    const attachUploaderNames = async (assets: Array<Record<string, unknown>>): Promise<void> => {
      const uids = Array.from(
        new Set(
          assets
            .map((a) => (typeof a.uploadedBy === 'string' ? a.uploadedBy : null))
            .filter((s): s is string => !!s),
        ),
      );
      if (uids.length === 0) return;
      try {
        const refs = uids.map((uid) => db.collection('users').doc(uid));
        const docs = await db.getAll(...refs);
        const nameByUid = new Map<string, string>();
        for (const d of docs) {
          if (!d.exists) continue;
          const data = d.data() as { name?: string; email?: string } | undefined;
          const display = data?.name || data?.email || '';
          if (display) nameByUid.set(d.id, display);
        }
        for (const a of assets) {
          const uid = typeof a.uploadedBy === 'string' ? a.uploadedBy : null;
          if (uid && nameByUid.has(uid)) {
            (a as { uploadedByName?: string }).uploadedByName = nameByUid.get(uid)!;
          }
        }
      } catch (err) {
        console.error('[GET /api/review-links/[token]] uploader name resolve failed', err);
      }
    };

    // Signed-URL write-back buffer (Phase 62 CACHE-02). Filled by decorate(),
    // flushed before each terminal NextResponse.json() below.
    const pendingUrlWrites: Array<{ id: string; patch: Record<string, unknown> }> = [];
    const flushUrlWrites = async () => {
      if (pendingUrlWrites.length === 0) return;
      try {
        const batch = db.batch();
        for (const { id, patch } of pendingUrlWrites) {
          batch.update(db.collection('assets').doc(id), patch);
        }
        await batch.commit();
      } catch (err) {
        console.error('[GET /api/review-links/[token]] signed URL cache write-back failed', err);
      } finally {
        pendingUrlWrites.length = 0;
      }
    };

    // Attach signed URLs on a raw asset doc. Uses the signed-URL cache so a
    // 200-asset link no longer fires 600 GCS sign calls per guest page load.
    const decorate = async (asset: any) => {
      const patch: Record<string, unknown> = {};

      // v2.4 STAMP-04/-05/-08 — prefer the Meta-stamped copy for guests when
      // it's fresh (stampedAt >= updatedAt). Stale / missing stamps fall
      // through to the original gcsPath below — guests always see working
      // content. Internal /api/assets never runs this branch (separate route).
      const stampedAt = coerceToDate(asset.stampedAt);
      const assetUpdatedAt = coerceToDate(asset.updatedAt);
      const stampFresh = Boolean(
        asset.stampedGcsPath &&
        stampedAt &&
        (!assetUpdatedAt || stampedAt.getTime() >= assetUpdatedAt.getTime())
      );

      let signedViaStamp = false;
      if (stampFresh && asset.stampedGcsPath) {
        try {
          const res = await getOrCreateSignedUrl({
            gcsPath: asset.stampedGcsPath,
            cached: asset.stampedSignedUrl,
            cachedExpiresAt: asset.stampedSignedUrlExpiresAt,
            ttlMinutes: 120,
          });
          // Guest-facing signedUrl is the stamped URL. The original signedUrl
          // cache on the asset doc is NOT mutated — keeps the internal
          // viewer's cached URL valid.
          asset.signedUrl = res.url;
          asset.metaStamped = true;
          signedViaStamp = true;
          if (res.fresh) {
            patch.stampedSignedUrl = res.url;
            patch.stampedSignedUrlExpiresAt = res.expiresAt;
          }
        } catch (err) {
          console.error('[GET /api/review-links/[token]] sign stamped URL failed — falling back to original', err);
          // signedViaStamp stays false → fall through to the original
          // gcsPath block below.
        }
      }

      if (!signedViaStamp && asset.gcsPath) {
        try {
          const res = await getOrCreateSignedUrl({
            gcsPath: asset.gcsPath,
            cached: asset.signedUrl,
            cachedExpiresAt: asset.signedUrlExpiresAt,
            ttlMinutes: 120,
          });
          asset.signedUrl = res.url;
          if (res.fresh) {
            patch.signedUrl = res.url;
            patch.signedUrlExpiresAt = res.expiresAt;
          }
        } catch (err) {
          console.error('[GET /api/review-links/[token]] sign asset URL failed', err);
        }
      }
      if (asset.thumbnailGcsPath) {
        try {
          const res = await getOrCreateSignedUrl({
            gcsPath: asset.thumbnailGcsPath,
            cached: asset.thumbnailSignedUrl,
            cachedExpiresAt: asset.thumbnailSignedUrlExpiresAt,
            ttlMinutes: 720,
          });
          asset.thumbnailSignedUrl = res.url;
          if (res.fresh) {
            patch.thumbnailSignedUrl = res.url;
            patch.thumbnailSignedUrlExpiresAt = res.expiresAt;
          }
        } catch (err) {
          console.error('[GET /api/review-links/[token]] sign thumbnail URL failed', err);
        }
      }
      // Sprite strip for hover scrub on the guest-facing AssetCard. Mirrors
      // the authenticated /api/assets decorate pattern. Without this, guests
      // fall through to the lazy /generate-sprite fetch which 401s for them
      // and leaves the card with no scrub affordance.
      if (asset.spriteStripGcsPath) {
        try {
          const res = await getOrCreateSignedUrl({
            gcsPath: asset.spriteStripGcsPath,
            cached: asset.spriteSignedUrl,
            cachedExpiresAt: asset.spriteSignedUrlExpiresAt,
            ttlMinutes: 720,
          });
          asset.spriteSignedUrl = res.url;
          if (res.fresh) {
            patch.spriteSignedUrl = res.url;
            patch.spriteSignedUrlExpiresAt = res.expiresAt;
          }
        } catch (err) {
          console.error('[GET /api/review-links/[token]] sign sprite URL failed', err);
        }
      }
      if (link.allowDownloads) {
        // v2.4 STAMP-04 — prefer the stamped GCS path for the download URL
        // too. Guest clicks Download → receives the stamped file with the
        // Meta XMP attribution embedded. Falls back to the original when
        // the stamp is absent or stale (signedViaStamp tracks this).
        const downloadPath =
          signedViaStamp && asset.stampedGcsPath ? asset.stampedGcsPath : asset.gcsPath;
        if (downloadPath) {
          try {
            asset.downloadUrl = await generateDownloadSignedUrl(downloadPath, asset.name);
          } catch (err) {
            console.error('[GET /api/review-links/[token]] sign download URL failed', err);
          }
        }
      }

      if (Object.keys(patch).length > 0) {
        pendingUrlWrites.push({ id: asset.id, patch });
      }
      return asset;
    };

    // Version grouping helper — shared across paths
    const groupByVersion = (list: any[], showAll: boolean): any[] => {
      const groups = new Map<string, any[]>();
      for (const asset of list) {
        const groupId = asset.versionGroupId || asset.id;
        if (!groups.has(groupId)) groups.set(groupId, []);
        groups.get(groupId)!.push(asset);
      }
      if (showAll) {
        return Array.from(groups.values()).flatMap((group) => {
          const sorted = group.sort((a, b) => (b.version || 1) - (a.version || 1));
          return sorted.map((v) => ({ ...v, _versionCount: group.length }));
        });
      }
      return Array.from(groups.values()).map((group) => {
        const sorted = group.sort((a, b) => (b.version || 1) - (a.version || 1));
        return { ...sorted[0], _versionCount: group.length };
      });
    };

    // If ?folder=X is requested (or we auto-drilled), serve direct children of that folder
    if (effectiveFolderRequest) {
      const ok = await folderIsAccessible(effectiveFolderRequest);
      if (!ok) return NextResponse.json({ error: 'Folder not available in this review link' }, { status: 403 });

      const assetsSnap = await db.collection('assets')
        .where('projectId', '==', link.projectId)
        .where('status', '==', 'ready')
        .where('folderId', '==', effectiveFolderRequest)
        .get();
      // SDC-02: filter soft-deleted before decorating
      const liveAssetDocs = assetsSnap.docs.filter((d) => !(d.data() as any).deletedAt);
      const decoratedAssets = await Promise.all(liveAssetDocs.map((d) => decorate({ id: d.id, ...d.data() })));
      const assets = groupByVersion(decoratedAssets, !!link.showAllVersions);
      await attachUploaderNames(assets);

      const subfoldersSnap = await db.collection('folders')
        .where('projectId', '==', link.projectId)
        .where('parentId', '==', effectiveFolderRequest)
        .get();
      // SDC-02: filter soft-deleted folders
      const folders = subfoldersSnap.docs
        .filter((d) => !(d.data() as any).deletedAt)
        .map((d) => ({ id: d.id, ...d.data() }));

      await flushUrlWrites();
      const safeLink = serializeReviewLink(link);
      return NextResponse.json({ reviewLink: safeLink, assets, folders, projectName, currentFolderId: effectiveFolderRequest });
    }

    // Root view — behavior depends on link type
    let assets: any[];
    let folders: any[] = [];

    const hasArrays = (link.folderIds && link.folderIds.length) || (link.assetIds && link.assetIds.length);

    if (hasArrays) {
      // Editable link — show folderIds[] as navigable folder cards + assetIds[] as loose assets.
      // Guests click into a folder to load its contents via ?folder=X.
      const assetMap = new Map<string, any>();
      const missingAssetIds: string[] = [];

      if (link.assetIds?.length) {
        const docs = await Promise.all((link.assetIds as string[]).map((id) => db.collection('assets').doc(id).get()));
        for (const d of docs) {
          if (!d.exists) { missingAssetIds.push(d.id); continue; }
          const a = { id: d.id, ...d.data() } as any;
          // SDC-02: treat soft-deleted as missing for guests
          if (a.deletedAt) { missingAssetIds.push(d.id); continue; }
          if (a.status === 'ready') assetMap.set(a.id, a);
        }
      }

      if (link.folderIds?.length) {
        // Resolve folder docs for display (parallel direct doc gets — avoids __name__ IN quirks)
        const folderDocs = await Promise.all(
          (link.folderIds as string[]).map((id) => db.collection('folders').doc(id).get())
        );
        for (const d of folderDocs) {
          if (!d.exists) continue;
          const f = d.data() as any;
          // SDC-02: skip soft-deleted folders (guests shouldn't see them)
          if (f?.deletedAt) continue;
          if (f?.projectId === link.projectId) folders.push({ id: d.id, ...f });
        }
      }

      let decorated = await Promise.all(Array.from(assetMap.values()).map(decorate));

      if (link.showAllVersions) {
        // Expand loose-asset selections to include every sibling version
        const groupIds = new Set<string>();
        for (const a of decorated) if (a.versionGroupId) groupIds.add(a.versionGroupId);
        for (const gid of Array.from(groupIds)) {
          const snap = await db.collection('assets')
            .where('versionGroupId', '==', gid)
            .where('status', '==', 'ready')
            .get();
          for (const d of snap.docs) {
            if (!assetMap.has(d.id)) assetMap.set(d.id, { id: d.id, ...d.data() });
          }
        }
        decorated = await Promise.all(Array.from(assetMap.values()).map(decorate));
      }

      assets = groupByVersion(decorated, !!link.showAllVersions);
      // Surface deleted-asset placeholders so owner-side editors can detect stale refs
      for (const id of missingAssetIds) assets.push({ id, _deleted: true });
    } else {
      // Legacy folder-scoped or full-project: show contents of the scope root at top level
      let assetsQuery = db.collection('assets').where('projectId', '==', link.projectId).where('status', '==', 'ready');
      if (link.folderId) {
        assetsQuery = assetsQuery.where('folderId', '==', link.folderId) as any;
      }
      const assetsSnap = await assetsQuery.get();
      // SDC-02: filter soft-deleted before decoration
      const liveAssetDocs = assetsSnap.docs.filter((d) => !(d.data() as any).deletedAt);
      const decorated = await Promise.all(liveAssetDocs.map((d) => decorate({ id: d.id, ...d.data() })));
      assets = groupByVersion(decorated, !!link.showAllVersions);

      let foldersQuery = db.collection('folders').where('projectId', '==', link.projectId);
      if (link.folderId) {
        foldersQuery = foldersQuery.where('parentId', '==', link.folderId) as any;
      } else {
        foldersQuery = foldersQuery.where('parentId', '==', null) as any;
      }
      const foldersSnap = await foldersQuery.get();
      // SDC-02: filter soft-deleted folders
      folders = foldersSnap.docs
        .filter((d) => !(d.data() as any).deletedAt)
        .map((d) => ({ id: d.id, ...d.data() }));
    }

    // Remove password from response
    await attachUploaderNames(assets);
    await flushUrlWrites();
    const safeLink = serializeReviewLink(link);

    return NextResponse.json({
      reviewLink: safeLink,
      assets,
      folders,
      projectName,
      currentFolderId: null,
    });
  } catch (error) {
    console.error('Review link error:', error);
    return NextResponse.json({ error: 'Failed to load review link' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    const ALLOWED = new Set([
      'name',
      'password',
      'expiresAt',
      'allowComments',
      'allowDownloads',
      'allowApprovals',
      'showAllVersions',
    ]);
    for (const key of Object.keys(body)) {
      if (!ALLOWED.has(key)) {
        return NextResponse.json({ error: `Field '${key}' is not editable` }, { status: 400 });
      }
    }

    const db = getAdminDb();
    const doc = await db.collection('reviewLinks').doc(params.token).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const link = { id: doc.id, ...doc.data() } as ReviewLink;
    const projDoc = await db.collection('projects').doc(link.projectId).get();
    if (!projDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const project = { id: projDoc.id, ...projDoc.data() } as Project;
    if (!canEditReviewLink(user, project, link)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const update: Record<string, unknown> = {};

    if ('name' in body) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 });
      }
      update.name = body.name.trim();
    }

    if ('password' in body) {
      if (body.password === '' || body.password === null || body.password === undefined) {
        update.password = FieldValue.delete();
      } else if (typeof body.password === 'string') {
        // SEC-20: hash at write — never store plaintext
        update.password = hashPassword(body.password);
      } else {
        return NextResponse.json({ error: 'password must be a string or null' }, { status: 400 });
      }
    }

    if ('expiresAt' in body) {
      if (body.expiresAt === null) {
        update.expiresAt = null;
      } else if (typeof body.expiresAt === 'string') {
        const date = new Date(body.expiresAt);
        if (Number.isNaN(date.getTime())) {
          return NextResponse.json({ error: 'expiresAt must be a valid date string' }, { status: 400 });
        }
        update.expiresAt = Timestamp.fromDate(date);
      } else {
        return NextResponse.json({ error: 'expiresAt must be an ISO date string or null' }, { status: 400 });
      }
    }

    // allowComments default is true (matches POST semantics) — only coerce to false on explicit false
    if ('allowComments' in body) {
      update.allowComments = body.allowComments !== false;
    }
    if ('allowDownloads' in body) {
      update.allowDownloads = body.allowDownloads === true;
    }
    if ('allowApprovals' in body) {
      update.allowApprovals = body.allowApprovals === true;
    }
    if ('showAllVersions' in body) {
      update.showAllVersions = body.showAllVersions === true;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No changes' }, { status: 400 });
    }

    await doc.ref.update(update);
    const updated = await doc.ref.get();
    const updatedData = updated.data() as Record<string, unknown>;
    return NextResponse.json({
      link: serializeReviewLink({ id: params.token, ...updatedData }),
    });
  } catch (err) {
    console.error('[PUT /api/review-links/[token]]', err);
    return NextResponse.json({ error: 'Failed to update review link' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = getAdminDb();
    const doc = await db.collection('reviewLinks').doc(params.token).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const link = { id: doc.id, ...doc.data() } as ReviewLink;
    const projDoc = await db.collection('projects').doc(link.projectId).get();
    if (!projDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const project = { id: projDoc.id, ...projDoc.data() } as Project;
    if (!canDeleteReviewLink(user, project, link)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await doc.ref.delete();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/review-links/[token]]', err);
    return NextResponse.json({ error: 'Failed to delete review link' }, { status: 500 });
  }
}
