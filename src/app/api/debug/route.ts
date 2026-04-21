import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const result: Record<string, string> = {};

  // Firebase Admin initialization healthcheck
  try {
    const { getAdminAuth } = await import('@/lib/firebase-admin');
    getAdminAuth();
    result.firebaseInit = 'OK';
  } catch (e) {
    result.firebaseInit = 'FAILED: ' + (e instanceof Error ? e.message : String(e));
  }

  // Runtime identifiers (safe for admin eyes)
  result.gitCommit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? 'local';
  result.deploymentUrl = process.env.VERCEL_URL ?? 'local';
  result.nodeEnv = process.env.NODE_ENV ?? 'unknown';
  result.nodeVersion = process.version;
  result.admin = admin.email;

  return NextResponse.json(result);
}
