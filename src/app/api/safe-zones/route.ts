import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

/** The 14 built-in safe zones seeded on first GET. */
const BUILT_IN_ZONES = [
  { name: 'TikTok',                  ratio: '9:16', file: '001-9x16-HotZone-for-TikTok.png',                          order: 1  },
  { name: 'Stories',                 ratio: '9:16', file: '005-9x16-HotZone-for-Stories.png',                         order: 2  },
  { name: 'Meta Reels',              ratio: '9:16', file: '006-9x16-HotZone-for-MetaReels.png',                       order: 3  },
  { name: 'Snapchat',                ratio: '9:16', file: '007-9x16-HotZone-for-Snapchat.png',                        order: 4  },
  { name: 'YouTube Vertical',        ratio: '9:16', file: '008-9x16-HotZone-for-YoutubeVertical.png',                 order: 5  },
  { name: 'TikTok Arabic',           ratio: '9:16', file: '010-9x16-HotZone-for-TikTokArabic.png',                    order: 6  },
  { name: 'Reels + TikTok',          ratio: '9:16', file: '011-9x16-HotZone-for-Reels+TikTok.png',                    order: 7  },
  { name: 'Reels + YT Shorts',       ratio: '9:16', file: '012-9x16-HotZone-for-Reels+YoutubeShorts.png',             order: 8  },
  { name: 'Hims & Hers',             ratio: '9:16', file: '013-9x16-HotZone-for-Hims&Hers.png',                       order: 9  },
  { name: 'Hims & Hers (Disc.)',     ratio: '9:16', file: '014-9x16-HotZone-for-Hims&HersDisclaimers.png',            order: 10 },
  { name: 'YouTube Horizontal',      ratio: '16:9', file: '009-16x9-HotZone-for-YoutubeHorizontal.png',               order: 11 },
  { name: 'Meta 4:5 (with 1:1)',     ratio: '4:5',  file: '003-4x5-HotZone-for-Meta(4x5With1x1SafeZone).png',         order: 12 },
  { name: 'Meta 4:5',                ratio: '4:5',  file: '004-4x5-HotZone-for-Meta(4x5OriginalSafeZone).png',        order: 13 },
  { name: 'Meta 1:1',                ratio: '1:1',  file: '002-1x1-HotZone-for-Meta.png',                             order: 14 },
] as const;

export async function GET() {
  try {
    const db = getAdminDb();
    const snap = await db.collection('safeZones').orderBy('order', 'asc').get();

    if (snap.empty) {
      // Auto-seed built-in zones
      const batch = db.batch();
      for (const z of BUILT_IN_ZONES) {
        const ref = db.collection('safeZones').doc();
        batch.set(ref, {
          name: z.name,
          ratio: z.ratio,
          imageUrl: `/safezones/${z.file}`,
          gcsPath: null,
          isBuiltIn: true,
          order: z.order,
          createdAt: Timestamp.now(),
          createdBy: null,
        });
      }
      await batch.commit();

      const fresh = await db.collection('safeZones').orderBy('order', 'asc').get();
      return NextResponse.json({ zones: fresh.docs.map((d) => ({ id: d.id, ...d.data() })) });
    }

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
