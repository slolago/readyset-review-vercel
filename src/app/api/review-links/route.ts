import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { canAccessProject, canCreateReviewLink } from '@/lib/permissions';
import type { Project } from '@/types';
import { serializeReviewLink, hashPassword } from '@/lib/review-links';
import { Timestamp } from 'firebase-admin/firestore';
import { customAlphabet } from 'nanoid';

const generateShortToken = customAlphabet(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  8
);

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const db = getAdminDb();
  const projDoc = await db.collection('projects').doc(projectId).get();
  if (!projDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const project = { id: projDoc.id, ...projDoc.data() } as Project;
  if (!canAccessProject(user, project)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // no orderBy — avoids composite index requirement; sorted in-memory below
    const snap = await db.collection('reviewLinks')
      .where('projectId', '==', projectId)
      .get();

    // Strip password field — only indicate whether one is set
    const links = snap.docs.map((d) =>
      serializeReviewLink({ id: d.id, ...(d.data() as Record<string, unknown>) })
    );

    // Sort by createdAt desc in memory (supports both _seconds and seconds shapes)
    links.sort((a, b) => {
      const ca = (a as any).createdAt;
      const cb = (b as any).createdAt;
      const ta = ca?._seconds ?? ca?.seconds ?? 0;
      const tb = cb?._seconds ?? cb?.seconds ?? 0;
      return tb - ta;
    });

    return NextResponse.json({ links });
  } catch (error) {
    console.error('review-links GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch review links' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { name, projectId, folderId, folderIds, allowComments, password, expiresAt,
            allowDownloads, allowApprovals, showAllVersions, assetIds } = await request.json();

    if (!name || !projectId) return NextResponse.json({ error: 'name and projectId required' }, { status: 400 });
    if (assetIds && assetIds.length > 200) return NextResponse.json({ error: 'Maximum 200 assets per link' }, { status: 400 });
    if (folderIds && folderIds.length > 50) return NextResponse.json({ error: 'Maximum 50 folders per link' }, { status: 400 });

    const db = getAdminDb();
    const projDoc = await db.collection('projects').doc(projectId).get();
    if (!projDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const project = { id: projDoc.id, ...projDoc.data() } as Project;
    if (!canCreateReviewLink(user, project)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const token = generateShortToken();

    // New links use folderIds[]/assetIds[] arrays (editable). folderId (legacy) is only set
    // when the caller passes a single folderId and no arrays — preserves backward compat.
    const cleanAssetIds: string[] | null = Array.isArray(assetIds) && assetIds.length ? assetIds.filter((x: unknown) => typeof x === 'string') : null;
    const cleanFolderIds: string[] | null = Array.isArray(folderIds) && folderIds.length ? folderIds.filter((x: unknown) => typeof x === 'string') : null;

    const data: Record<string, unknown> = {
      token,
      name,
      projectId,
      folderId: (cleanAssetIds || cleanFolderIds) ? null : (folderId || null),
      folderIds: cleanFolderIds,
      assetIds: cleanAssetIds,
      createdBy: user.id,
      allowComments: allowComments !== false,
      allowDownloads: allowDownloads === true,
      allowApprovals: allowApprovals === true,
      showAllVersions: showAllVersions === true,
      expiresAt: expiresAt ? Timestamp.fromDate(new Date(expiresAt)) : null,
      createdAt: Timestamp.now(),
    };
    // SEC-20: hash at write — store bcrypt hash, never plaintext
    if (password && typeof password === 'string') data.password = hashPassword(password);

    await db.collection('reviewLinks').doc(token).set(data);
    const doc = await db.collection('reviewLinks').doc(token).get();
    const docData = doc.data() as Record<string, unknown>;

    return NextResponse.json({ link: serializeReviewLink({ id: token, ...docData }) }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/review-links]', err);
    return NextResponse.json({ error: 'Failed to create review link' }, { status: 500 });
  }
}
