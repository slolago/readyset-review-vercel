import bcrypt from 'bcryptjs';
import type { ReviewLink } from '@/types';

/** Review-link shape safe to return from API responses. Never contains `password`. */
export type SanitizedReviewLink = Omit<ReviewLink, 'password'> & { hasPassword: boolean };

/**
 * Strip the `password` field from a review-link record and expose a boolean
 * `hasPassword` flag instead. Accepts a raw Firestore-shaped object (not strict
 * ReviewLink) because callers pass `{ id, ...doc.data() }` spreads.
 *
 * Centralizing this prevents password leaks across the four response paths:
 *   - GET /api/review-links
 *   - GET /api/review-links/all
 *   - GET /api/review-links/[token]/contents
 *   - PATCH /api/review-links/[token] (response body)
 */
export function serializeReviewLink<T extends Record<string, unknown>>(
  link: T
): Omit<T, 'password'> & { hasPassword: boolean } {
  const { password, ...rest } = link;
  return { ...rest, hasPassword: !!password } as Omit<T, 'password'> & { hasPassword: boolean };
}

// ---------- Password hashing (SEC-20) ----------

const BCRYPT_COST = 10;
const BCRYPT_PREFIX_RE = /^\$2[aby]\$/;

/** True if the stored string looks like a bcrypt hash. */
export function isBcryptHash(stored: string): boolean {
  return typeof stored === 'string' && BCRYPT_PREFIX_RE.test(stored);
}

/** Hash a plaintext password with bcrypt cost=10. */
export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, BCRYPT_COST);
}

/**
 * Verify a plaintext password against a stored value.
 *
 * - If `stored` is a bcrypt hash, do a constant-time bcrypt compare.
 * - Else treat it as a legacy plaintext password (pre-SEC-20 records).
 *   Match via === and flag `needsUpgrade=true` so the caller can fire-and-forget
 *   a Firestore update to replace the plaintext with a bcrypt hash.
 */
export function verifyPassword(
  plain: string,
  stored: string
): { ok: boolean; needsUpgrade: boolean } {
  if (!stored) return { ok: false, needsUpgrade: false };
  if (isBcryptHash(stored)) {
    return { ok: bcrypt.compareSync(plain, stored), needsUpgrade: false };
  }
  // Legacy plaintext — compare directly; flag for upgrade on success.
  const ok = plain === stored;
  return { ok, needsUpgrade: ok };
}
