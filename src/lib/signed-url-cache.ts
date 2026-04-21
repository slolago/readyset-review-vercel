import { Timestamp } from 'firebase-admin/firestore';
import { generateReadSignedUrl } from './gcs';

/**
 * Signed URL cache (Phase 62 — CACHE-01..03).
 *
 * Assets store signed URLs alongside their expiry timestamp. List endpoints
 * call `getOrCreateSignedUrl` per asset; if the cached URL still has >30 min
 * of life, we reuse it. Otherwise we regenerate.
 *
 * The caller owns write-back: we return { url, fresh, expiresAt } and let the
 * route decide when to batch-commit the new values to Firestore. This keeps
 * the helper pure-ish and lets the caller avoid a per-asset round-trip.
 */

/** Minimum remaining TTL before we force regeneration. */
const REFRESH_THRESHOLD_MS = 30 * 60 * 1000; // 30 min

/** Duck-typed Timestamp — admin and client SDK both expose toMillis(). */
interface TimestampLike {
  toMillis: () => number;
}

function toMillis(t: TimestampLike | undefined | null): number {
  if (!t) return 0;
  try {
    return t.toMillis();
  } catch {
    return 0;
  }
}

export interface SignedUrlCacheResult {
  /** The URL to return to the client — always defined on success. */
  url: string;
  /** True if regenerated this call; false if the cached value was reused. */
  fresh: boolean;
  /** Admin SDK Timestamp for when this URL expires (write back with this). */
  expiresAt: Timestamp;
}

export interface GetOrCreateSignedUrlArgs {
  gcsPath: string;
  cached?: string;
  cachedExpiresAt?: TimestampLike;
  /** TTL for regenerated URLs. Main: 120. Thumbnail/sprite: 720. */
  ttlMinutes: number;
}

/**
 * Returns the cached URL if it expires in >30 min, else regenerates.
 * Caller is responsible for writing `{ url, expiresAt }` back to Firestore
 * when `fresh === true`.
 */
export async function getOrCreateSignedUrl(
  args: GetOrCreateSignedUrlArgs
): Promise<SignedUrlCacheResult> {
  const { gcsPath, cached, cachedExpiresAt, ttlMinutes } = args;

  const now = Date.now();
  const cachedExpMs = toMillis(cachedExpiresAt);
  const remainingMs = cachedExpMs - now;

  if (cached && remainingMs > REFRESH_THRESHOLD_MS) {
    return {
      url: cached,
      fresh: false,
      expiresAt: Timestamp.fromMillis(cachedExpMs),
    };
  }

  const url = await generateReadSignedUrl(gcsPath, ttlMinutes);
  const expiresAt = Timestamp.fromMillis(now + ttlMinutes * 60 * 1000);
  return { url, fresh: true, expiresAt };
}
