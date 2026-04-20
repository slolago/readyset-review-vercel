import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import type { Collaborator, Project, ReviewLink } from '@/types';

interface RouteParams {
  params: { projectId: string };
}

/**
 * GET /api/admin/projects/[projectId]/permissions
 *
 * Unified audit endpoint for a project — collaborators (with current
 * disabled/invited flag on each user), review links (flags + creator name +
 * expiry, never the password value), and pending invites (collaborators whose
 * user doc still has `invited === true`).
 *
 * Phase 45 / ACCESS-04.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const db = getAdminDb();
    const projDoc = await db.collection('projects').doc(params.projectId).get();
    if (!projDoc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const project = { id: projDoc.id, ...projDoc.data() } as Project;

    // Collect every user id we need to hydrate: owner + collaborators + review-link creators
    const userIds = new Set<string>();
    userIds.add(project.ownerId);
    const collaborators: Collaborator[] = Array.isArray(project.collaborators) ? project.collaborators : [];
    for (const c of collaborators) if (c.userId) userIds.add(c.userId);

    const reviewLinksSnap = await db
      .collection('reviewLinks')
      .where('projectId', '==', params.projectId)
      .get();
    const rawReviewLinks = reviewLinksSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<ReviewLink & { id: string }>;
    for (const rl of rawReviewLinks) if (rl.createdBy) userIds.add(rl.createdBy);

    // Batch-hydrate users
    const userDocs = await Promise.all(
      Array.from(userIds).map((id) => db.collection('users').doc(id).get())
    );
    const userMap = new Map<string, any>();
    for (const d of userDocs) {
      if (d.exists) userMap.set(d.id, { id: d.id, ...d.data() });
    }

    const ownerUser = userMap.get(project.ownerId);

    // Shape review links — strip password, surface hasPassword
    const reviewLinks = rawReviewLinks.map((rl) => {
      const creator = userMap.get(rl.createdBy);
      return {
        token: rl.token ?? rl.id,
        folderId: rl.folderId ?? null,
        folderIds: Array.isArray(rl.folderIds) ? rl.folderIds : undefined,
        assetIds: Array.isArray(rl.assetIds) ? rl.assetIds : undefined,
        name: rl.name ?? null,
        createdBy: rl.createdBy,
        createdByName: creator?.name ?? 'Unknown',
        createdAt: rl.createdAt ?? null,
        expiresAt: rl.expiresAt ?? null,
        allowComments: rl.allowComments !== false,
        allowDownloads: !!rl.allowDownloads,
        allowApprovals: !!rl.allowApprovals,
        showAllVersions: !!rl.showAllVersions,
        hasPassword: !!(rl as any).password,
      };
    });

    // Pending invites: collaborators whose user doc has invited===true
    const pendingInvites = collaborators
      .filter((c) => {
        const u = userMap.get(c.userId);
        return u?.invited === true;
      })
      .map((c) => ({ userId: c.userId, name: c.name, email: c.email }));

    // Hydrate collaborators with current disabled flag (helpful for audit)
    const hydratedCollaborators = collaborators.map((c) => {
      const u = userMap.get(c.userId);
      return {
        userId: c.userId,
        name: c.name,
        email: c.email,
        role: c.role,
        disabled: !!u?.disabled,
        invited: !!u?.invited,
      };
    });

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        ownerId: project.ownerId,
        ownerName: ownerUser?.name ?? 'Unknown',
        ownerEmail: ownerUser?.email ?? '',
      },
      collaborators: hydratedCollaborators,
      reviewLinks,
      pendingInvites,
    });
  } catch (err) {
    console.error('admin project permissions GET error:', err);
    return NextResponse.json({ error: 'Failed to load project permissions' }, { status: 500 });
  }
}
