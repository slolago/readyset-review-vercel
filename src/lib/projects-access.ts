/**
 * Phase 67 (PERF-01) — shared access helper used by /api/projects and /api/stats.
 *
 * Replaces the legacy "scan the entire projects collection then filter in memory"
 * pattern with two indexed queries run in parallel:
 *   - ownerId == userId
 *   - collaboratorIds array-contains userId
 *
 * The union is deduped by doc id. Platform admins bypass both queries and get the
 * full collection (admin scan is acceptable — admin is a low-traffic path).
 *
 * Callers that need fine-grained role checks (editor vs reviewer) still call
 * canAccessProject / getProjectRole from src/lib/permissions.ts.
 */

import { getAdminDb } from '@/lib/firebase-admin';
import type { Project } from '@/types';

export async function fetchAccessibleProjects(
  userId: string,
  isPlatformAdmin: boolean
): Promise<Project[]> {
  const db = getAdminDb();

  if (isPlatformAdmin) {
    const snap = await db.collection('projects').get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Project);
  }

  const [ownedSnap, collabSnap] = await Promise.all([
    db.collection('projects').where('ownerId', '==', userId).get(),
    db.collection('projects').where('collaboratorIds', 'array-contains', userId).get(),
  ]);

  const byId = new Map<string, Project>();
  for (const d of ownedSnap.docs) byId.set(d.id, { id: d.id, ...d.data() } as Project);
  for (const d of collabSnap.docs) if (!byId.has(d.id)) byId.set(d.id, { id: d.id, ...d.data() } as Project);
  return Array.from(byId.values());
}
