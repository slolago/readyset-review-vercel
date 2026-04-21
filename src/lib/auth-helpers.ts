import { NextRequest } from 'next/server';
import { getAdminAuth, getAdminDb } from './firebase-admin';
import type { User } from '@/types';
import { platformRoleAtLeast, type PlatformRole } from './permissions';

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

  const data = userDoc.data();
  if (!data) return null;
  if (data.disabled === true) return null;

  return { id: userDoc.id, ...data } as User;
}

export async function requireAdmin(
  request: NextRequest
): Promise<User | null> {
  const user = await getAuthenticatedUser(request);
  if (!user || user.role !== 'admin') return null;
  return user;
}

export function getIdTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

/**
 * @deprecated Use `platformRoleAtLeast` from '@/lib/permissions' directly.
 */
export function roleAtLeast(user: User, minRole: PlatformRole): boolean {
  return platformRoleAtLeast(user, minRole);
}
