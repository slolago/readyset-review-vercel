import { NextRequest } from 'next/server';
import { getAdminAuth, getAdminDb } from './firebase-admin';
import type { User } from '@/types';

export async function verifyAuthToken(
  request: NextRequest
): Promise<{ uid: string; email: string } | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email || '' };
  } catch {
    return null;
  }
}

export async function getAuthenticatedUser(
  request: NextRequest
): Promise<User | null> {
  const auth = await verifyAuthToken(request);
  if (!auth) return null;

  const db = getAdminDb();
  const userDoc = await db.collection('users').doc(auth.uid).get();
  if (!userDoc.exists) return null;

  return { id: userDoc.id, ...userDoc.data() } as User;
}

const ROLE_RANK: Record<string, number> = {
  viewer: 0,
  editor: 1,
  manager: 2,
  admin: 3,
};

export function roleAtLeast(user: User, minRole: 'viewer' | 'editor' | 'manager' | 'admin'): boolean {
  return (ROLE_RANK[user.role] ?? 0) >= (ROLE_RANK[minRole] ?? 0);
}

export async function requireAdmin(
  request: NextRequest
): Promise<User | null> {
  const user = await getAuthenticatedUser(request);
  if (!user || user.role !== 'admin') return null;
  return user;
}

export async function canAccessProject(
  userId: string,
  projectId: string
): Promise<boolean> {
  const db = getAdminDb();
  const projectDoc = await db.collection('projects').doc(projectId).get();
  if (!projectDoc.exists) return false;

  const project = projectDoc.data()!;
  if (project.ownerId === userId) return true;
  if (project.collaborators?.some((c: { userId: string }) => c.userId === userId)) return true;
  return false;
}

export function getIdTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}
