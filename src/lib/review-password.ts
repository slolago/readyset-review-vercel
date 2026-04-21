import type { NextRequest } from 'next/server';

/**
 * SEC-21: prefer the `x-review-password` header over the `?password=` query
 * string. The header keeps the password out of CDN + Vercel access logs.
 *
 * The query string is still accepted (back-compat) but emits a one-line
 * deprecation warning on the server console so owners can spot stale clients.
 *
 * Returns `undefined` when neither source has a value.
 */
export function extractReviewPassword(request: NextRequest): string | undefined {
  const header = request.headers.get('x-review-password');
  if (header) return header;

  const q = new URL(request.url).searchParams.get('password');
  if (q) {
    console.warn(
      '[SEC-21] review-link password received via ?password= query string — ' +
        'client should migrate to the x-review-password header.'
    );
    return q;
  }
  return undefined;
}
