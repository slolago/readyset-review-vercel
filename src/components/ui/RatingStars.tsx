'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RatingStarsProps {
  /** Current rating 1–5, or 0/undefined for unrated. */
  value: number | undefined | null;
  /** Called with the new value. Called with 0 when the user clears the rating. */
  onChange?: (value: number) => void;
  /** Readonly mode — no hover state, no click handlers. Used for display badges. */
  readOnly?: boolean;
  /** Visual size — maps to star px dimension + gap. */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Optional accessible label for the whole group. */
  ariaLabel?: string;
}

const SIZE_MAP = {
  sm: { star: 'w-3 h-3', gap: 'gap-0.5' },
  md: { star: 'w-4 h-4', gap: 'gap-1' },
  lg: { star: 'w-5 h-5', gap: 'gap-1.5' },
};

/**
 * 5-star rating widget. Interactive by default (click to set, click the
 * current star again to clear). Pass `readOnly` for display-only usage
 * on cards and filter summaries.
 *
 * Unlike most star widgets this does NOT show half-stars — ratings are
 * integers 0-5 for simplicity and to make the /assets filter a clean
 * "N+ stars" threshold.
 */
export function RatingStars({
  value,
  onChange,
  readOnly = false,
  size = 'md',
  className,
  ariaLabel,
}: RatingStarsProps) {
  const [hover, setHover] = useState<number | null>(null);
  const current = value ?? 0;
  // While hovering, preview the hovered rating without committing it.
  const displayed = hover ?? current;
  const { star, gap } = SIZE_MAP[size];

  const handleClick = (n: number) => {
    if (readOnly || !onChange) return;
    // Click the current rating to clear it. Otherwise, set to n.
    onChange(n === current ? 0 : n);
  };

  return (
    <div
      role={readOnly ? undefined : 'radiogroup'}
      aria-label={ariaLabel ?? (readOnly ? `Rated ${current} of 5 stars` : 'Rate this asset')}
      className={cn('flex items-center', gap, className)}
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= displayed;
        return (
          <button
            key={n}
            type="button"
            role={readOnly ? undefined : 'radio'}
            aria-checked={readOnly ? undefined : n === current}
            disabled={readOnly}
            tabIndex={readOnly ? -1 : 0}
            onClick={() => handleClick(n)}
            onMouseEnter={() => !readOnly && setHover(n)}
            className={cn(
              'transition-colors',
              readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110 transition-transform',
              filled ? 'text-amber-400' : 'text-frame-textMuted/40',
              !readOnly && !filled && 'hover:text-amber-400/60',
            )}
            aria-label={readOnly ? undefined : `${n} star${n === 1 ? '' : 's'}`}
          >
            <Star className={cn(star, filled && 'fill-current')} />
          </button>
        );
      })}
    </div>
  );
}
