/**
 * PATCH /api/assets/[assetId]/tags
 *
 * Body: { addTags?: string[]; removeTags?: string[] }
 *
 * Atomic tag mutation via FieldValue.arrayUnion / arrayRemove so concurrent
 * editors can't stomp each other. Tags are normalized (lowercase, trimmed,
 * collapsed internal whitespace → `-`) and validated against TAG_REGEX
 * before writing so the persisted set stays clean.
 *
 * Permission: any user with project access. Tags are collaborative
 * metadata — editors and reviewers can tag; viewers cannot (matches the
 * comment-post policy).
 */
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';

import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';
import { canPostComment } from '@/lib/permissions';
import type { Project } from '@/types';

// Lowercase alphanumerics + hyphen. Leading/trailing hyphens stripped at
// normalization time. 1-32 chars.
const TAG_REGEX = /^[a-z0-9][a-z0-9-]{0,31}$/;
const MAX_TAGS_PER_ASSET = 20;

function normalizeTag(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase().replace(/\s+/g, '-').replace(/^-+|-+$/g, '');
  if (!trimmed) return null;
  if (trimmed.length > 32) return null;
  if (!TAG_REGEX.test(trimmed)) return null;
  return trimmed;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { assetId: string } },
) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const rawAdd = Array.isArray(body.addTags) ? body.addTags : [];
  const rawRemove = Array.isArray(body.removeTags) ? body.removeTags : [];
  if (rawAdd.length === 0 && rawRemove.length === 0) {
    return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
  }

  // Normalize + dedupe on our side so we never persist garbage even if the
  // client sends variants like "Video", "  video ", "VIDEO".
  const addSet = new Set<string>();
  for (const t of rawAdd) {
    if (typeof t !== 'string') continue;
    const norm = normalizeTag(t);
    if (norm) addSet.add(norm);
  }
  const removeSet = new Set<string>();
  for (const t of rawRemove) {
    if (typeof t !== 'string') continue;
    const norm = normalizeTag(t);
    if (norm) removeSet.add(norm);
  }
  if (addSet.size === 0 && removeSet.size === 0) {
    return NextResponse.json({ error: 'No valid tags provided' }, { status: 400 });
  }

  const db = getAdminDb();
  const assetRef = db.collection('assets').doc(params.assetId);
  const assetSnap = await assetRef.get();
  if (!assetSnap.exists) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }
  const asset = assetSnap.data() as { projectId: string; tags?: string[] };

  const projectSnap = await db.collection('projects').doc(asset.projectId).get();
  if (!projectSnap.exists) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  const project = { id: projectSnap.id, ...projectSnap.data() } as Project;

  // Reuse the comment-post gate — the semantics match: everyone except
  // viewers can contribute collaborative metadata on assets they can see.
  if (!canPostComment(user, project)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Cap enforcement requires knowing the projected final size. Compute it
  // from the current set + our add/remove, then decide if we accept.
  const current = new Set((asset.tags ?? []) as string[]);
  Array.from(addSet).forEach((t) => current.add(t));
  Array.from(removeSet).forEach((t) => current.delete(t));
  if (current.size > MAX_TAGS_PER_ASSET) {
    return NextResponse.json(
      { error: `Too many tags — max ${MAX_TAGS_PER_ASSET} per asset` },
      { status: 400 },
    );
  }

  // One update call with both arrayUnion + arrayRemove. Admin SDK serializes
  // these as a single write, so concurrent requests each commit atomically
  // against their own deltas without clobbering the whole tags[] array.
  const update: Record<string, unknown> = {};
  if (addSet.size > 0) update.tags = FieldValue.arrayUnion(...Array.from(addSet));
  if (removeSet.size > 0 && addSet.size === 0) {
    update.tags = FieldValue.arrayRemove(...Array.from(removeSet));
  } else if (removeSet.size > 0 && addSet.size > 0) {
    // arrayUnion and arrayRemove can't be applied to the same field in a
    // single update. Do the remove second so the final state is union then
    // difference — a tag passed in BOTH lists (unusual) ends up absent.
    await assetRef.update({ tags: FieldValue.arrayUnion(...Array.from(addSet)) });
    await assetRef.update({ tags: FieldValue.arrayRemove(...Array.from(removeSet)) });
    const fresh = (await assetRef.get()).data() as { tags?: string[] };
    return NextResponse.json({ tags: fresh.tags ?? [] });
  }

  await assetRef.update(update);
  const fresh = (await assetRef.get()).data() as { tags?: string[] };
  return NextResponse.json({ tags: fresh.tags ?? [] });
}
