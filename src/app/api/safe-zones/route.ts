import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * The 14 built-in safe zones seeded by the idempotent ensure step below.
 * `slug` is the stable identity — the doc ID is always `builtin-<slug>`,
 * so concurrent callers and repeated invocations converge on the same set
 * of documents without duplicates.
 */
const BUILT_IN_ZONES = [
  { slug: 'tiktok',                name: 'TikTok',                ratio: '9:16', file: '001-9x16-HotZone-for-TikTok.png',                          order: 1  },
  { slug: 'stories',               name: 'Stories',               ratio: '9:16', file: '005-9x16-HotZone-for-Stories.png',                         order: 2  },
  { slug: 'meta-reels',            name: 'Meta Reels',            ratio: '9:16', file: '006-9x16-HotZone-for-MetaReels.png',                       order: 3  },
  { slug: 'snapchat',              name: 'Snapchat',              ratio: '9:16', file: '007-9x16-HotZone-for-Snapchat.png',                        order: 4  },
  { slug: 'youtube-vertical',      name: 'YouTube Vertical',      ratio: '9:16', file: '008-9x16-HotZone-for-YoutubeVertical.png',                 order: 5  },
  { slug: 'tiktok-arabic',         name: 'TikTok Arabic',         ratio: '9:16', file: '010-9x16-HotZone-for-TikTokArabic.png',                    order: 6  },
  { slug: 'reels-tiktok',          name: 'Reels + TikTok',        ratio: '9:16', file: '011-9x16-HotZone-for-Reels+TikTok.png',                    order: 7  },
  { slug: 'reels-yt-shorts',       name: 'Reels + YT Shorts',     ratio: '9:16', file: '012-9x16-HotZone-for-Reels+YoutubeShorts.png',             order: 8  },
  { slug: 'hims-hers',             name: 'Hims & Hers',           ratio: '9:16', file: '013-9x16-HotZone-for-Hims&Hers.png',                       order: 9  },
  { slug: 'hims-hers-disclaimers', name: 'Hims & Hers (Disc.)',   ratio: '9:16', file: '014-9x16-HotZone-for-Hims&HersDisclaimers.png',            order: 10 },
  { slug: 'youtube-horizontal',    name: 'YouTube Horizontal',    ratio: '16:9', file: '009-16x9-HotZone-for-YoutubeHorizontal.png',               order: 11 },
  { slug: 'meta-4x5-with-1x1',     name: 'Meta 4:5 (with 1:1)',   ratio: '4:5',  file: '003-4x5-HotZone-for-Meta(4x5With1x1SafeZone).png',         order: 12 },
  { slug: 'meta-4x5',              name: 'Meta 4:5',              ratio: '4:5',  file: '004-4x5-HotZone-for-Meta(4x5OriginalSafeZone).png',        order: 13 },
  { slug: 'meta-1x1',              name: 'Meta 1:1',              ratio: '1:1',  file: '002-1x1-HotZone-for-Meta.png',                             order: 14 },
] as const;

type AdminDb = ReturnType<typeof getAdminDb>;

/**
 * Ensure every built-in safe zone exists in Firestore. Idempotent — safe
 * to call on every GET. Matches existing docs by imageUrl (legacy auto-ID
 * docs from the old seed path) OR by the deterministic `builtin-<slug>`
 * doc ID (new path). Anything missing gets created with the slugged ID.
 *
 * Replaces the old `_system/safe-zones-seed` guard-doc approach: that
 * guard made the seeding a one-time event, so if the safeZones collection
 * was ever cleared (manual Firestore ops, migration, environment swap)
 * the seed never re-ran and the selector went permanently empty.
 */
async function ensureBuiltInZones(db: AdminDb): Promise<void> {
  const existing = await db.collection('safeZones').where('isBuiltIn', '==', true).get();
  const existingImageUrls = new Set<string>();
  const existingIds = new Set<string>();
  for (const d of existing.docs) {
    existingIds.add(d.id);
    const url = (d.data() as { imageUrl?: string }).imageUrl;
    if (typeof url === 'string' && url) existingImageUrls.add(url);
  }

  const missing = BUILT_IN_ZONES.filter((z) => {
    const imageUrl = `/safezones/${z.file}`;
    const docId = `builtin-${z.slug}`;
    // Already exists as a legacy auto-ID doc (matched by imageUrl) or as
    // the new slugged doc — skip either way.
    return !existingImageUrls.has(imageUrl) && !existingIds.has(docId);
  });

  if (missing.length === 0) return;

  // Deterministic doc IDs mean two concurrent requests writing the same
  // zone produce the same document — no duplicates, last-write-wins with
  // identical content. No transaction guard needed.
  const batch = db.batch();
  const now = Timestamp.now();
  for (const z of missing) {
    const ref = db.collection('safeZones').doc(`builtin-${z.slug}`);
    batch.set(ref, {
      slug: z.slug,
      name: z.name,
      ratio: z.ratio,
      imageUrl: `/safezones/${z.file}`,
      gcsPath: null,
      isBuiltIn: true,
      order: z.order,
      createdAt: now,
      createdBy: null,
    });
  }
  await batch.commit();
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = getAdminDb();
    // Idempotent — no-ops when every built-in is already present.
    await ensureBuiltInZones(db);

    const snap = await db.collection('safeZones').orderBy('order', 'asc').get();
    return NextResponse.json({ zones: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    console.error('[safe-zones GET]', err);
    return NextResponse.json({ error: 'Failed to fetch safe zones' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { name, ratio } = await request.json();
    if (!name?.trim() || !ratio?.trim()) {
      return NextResponse.json({ error: 'name and ratio are required' }, { status: 400 });
    }

    const db = getAdminDb();
    const lastSnap = await db.collection('safeZones').orderBy('order', 'desc').limit(1).get();
    const maxOrder = lastSnap.empty ? 0 : (lastSnap.docs[0].data().order ?? 0);

    const ref = db.collection('safeZones').doc();
    const data = {
      name: name.trim(),
      ratio: ratio.trim(),
      imageUrl: '',          // set after image upload
      gcsPath: null,
      isBuiltIn: false,
      order: maxOrder + 1,
      createdAt: Timestamp.now(),
      createdBy: admin.id,
    };
    await ref.set(data);

    return NextResponse.json({ zone: { id: ref.id, ...data } }, { status: 201 });
  } catch (err) {
    console.error('[safe-zones POST]', err);
    return NextResponse.json({ error: 'Failed to create safe zone' }, { status: 500 });
  }
}
