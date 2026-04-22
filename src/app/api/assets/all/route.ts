/**
 * GET /api/assets/all
 *
 * User-scoped flat list of every asset across the caller's accessible
 * projects. Powers the /assets global browse + search view linked from
 * the dashboard's Assets card. Unlike /api/assets (per-folder), this
 * endpoint crosses project boundaries in a single response.
 *
 * Permission scope:
 *   - Platform admins → every asset (whole collection)
 *   - Everyone else   → assets whose projectId is in fetchAccessibleProjects
 *
 * Returns fresh or cached signed URLs so AssetCard's thumbnail/video
 * preview path "just works" without a separate per-asset sign call.
 */
import { NextRequest, NextResponse } from 'next/server';

import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { fetchAccessibleProjects } from '@/lib/projects-access';
import { getOrCreateSignedUrl } from '@/lib/signed-url-cache';

// Soft cap on returned assets. Client does name search in-memory, so we
// need the whole set available. If a user accumulates more than this we
// add proper pagination + server-side search — for now, the default
// "biggest reasonable team" sizing matches the review-link asset cap
// scaled up.
const MAX_ASSETS = 1000;

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getAdminDb();
    const isAdmin = user.role === 'admin';
    const projects = await fetchAccessibleProjects(user.id, isAdmin);
    const projectIds = projects.map((p) => p.id);

    if (projectIds.length === 0) {
      return NextResponse.json({ assets: [] });
    }

    // Firestore `in` operator caps at 10 values — chunk + run in parallel.
    const chunks: string[][] = [];
    for (let i = 0; i < projectIds.length; i += 10) {
      chunks.push(projectIds.slice(i, i + 10));
    }
    const snaps = await Promise.all(
      chunks.map((chunk) =>
        db.collection('assets')
          .where('projectId', 'in', chunk)
          .where('status', '==', 'ready')
          .get(),
      ),
    );

    const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
    const assetsMap = new Map<string, Record<string, unknown>>();
    for (const snap of snaps) {
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown> & { deletedAt?: unknown };
        if (data.deletedAt) continue;
        assetsMap.set(d.id, { id: d.id, ...data });
      }
    }

    const all = Array.from(assetsMap.values());

    // Newest-first so recent uploads sit at the top of the global browse.
    all.sort((a, b) => {
      const ca = (a.createdAt as { _seconds?: number; seconds?: number } | undefined);
      const cb = (b.createdAt as { _seconds?: number; seconds?: number } | undefined);
      const ta = ca?._seconds ?? ca?.seconds ?? 0;
      const tb = cb?._seconds ?? cb?.seconds ?? 0;
      return tb - ta;
    });

    const sliced = all.slice(0, MAX_ASSETS);

    // Sign URLs + write back fresh ones in batch (same cache pattern as
    // /api/assets and /api/review-links/[token]).
    const pendingWrites: Array<{ id: string; patch: Record<string, unknown> }> = [];
    const decorated = await Promise.all(
      sliced.map(async (asset) => {
        const a = asset as Record<string, unknown> & {
          id: string;
          gcsPath?: string;
          thumbnailGcsPath?: string;
          signedUrl?: string;
          signedUrlExpiresAt?: unknown;
          thumbnailSignedUrl?: string;
          thumbnailSignedUrlExpiresAt?: unknown;
          thumbnailUrl?: string;
        };
        a.projectName = projectNameById.get(a.projectId as string) ?? '';

        if (a.gcsPath) {
          try {
            const res = await getOrCreateSignedUrl({
              gcsPath: a.gcsPath,
              cached: a.signedUrl,
              cachedExpiresAt: a.signedUrlExpiresAt as { toMillis: () => number } | undefined,
              ttlMinutes: 120,
            });
            a.signedUrl = res.url;
            if (res.fresh) {
              pendingWrites.push({ id: a.id, patch: { signedUrl: res.url, signedUrlExpiresAt: res.expiresAt } });
            }
          } catch (err) {
            console.error('[GET /api/assets/all] sign asset URL failed', err);
          }
        }
        if (a.thumbnailGcsPath) {
          try {
            const res = await getOrCreateSignedUrl({
              gcsPath: a.thumbnailGcsPath,
              cached: a.thumbnailSignedUrl,
              cachedExpiresAt: a.thumbnailSignedUrlExpiresAt as { toMillis: () => number } | undefined,
              ttlMinutes: 720,
            });
            a.thumbnailSignedUrl = res.url;
            a.thumbnailUrl = res.url;
            if (res.fresh) {
              pendingWrites.push({ id: a.id, patch: { thumbnailSignedUrl: res.url, thumbnailSignedUrlExpiresAt: res.expiresAt } });
            }
          } catch (err) {
            console.error('[GET /api/assets/all] sign thumbnail URL failed', err);
          }
        }
        return a;
      }),
    );

    if (pendingWrites.length > 0) {
      try {
        const batch = db.batch();
        for (const { id, patch } of pendingWrites) {
          batch.update(db.collection('assets').doc(id), patch);
        }
        await batch.commit();
      } catch (err) {
        console.error('[GET /api/assets/all] signed URL cache write-back failed', err);
      }
    }

    return NextResponse.json({ assets: decorated, totalAvailable: all.length, limit: MAX_ASSETS });
  } catch (err) {
    console.error('GET /api/assets/all error:', err);
    return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 });
  }
}
