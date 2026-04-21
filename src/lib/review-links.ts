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
