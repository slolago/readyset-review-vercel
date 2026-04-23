'use client';

import { useRef, useState } from 'react';
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
 * 5-star rating widget. Integer ratings only — no half-stars, to keep the
 * /assets "N+ stars" threshold filter unambiguous.
 *
 * Interaction:
 *   - Click a star to set rating; click the current rating to clear.
 *   - ArrowRight / ArrowUp: +1 (max 5).
 *   - ArrowLeft / ArrowDown: -1 (min 0 = unrated).
 *   - Home: set to 1.  End: set to 5.  0: clear.  1–5: jump to that rating.
 *   - Roving tabindex (only one star is tabbable at a time, matching ARIA
 *     radiogroup conventions).
 *
 * Pass `readOnly` for display-only badges on cards / filter summaries.
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
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = value ?? 0;
  // While hovering, preview the hovered rating without committing it.
  const displayed = hover ?? current;
  const { star, gap } = SIZE_MAP[size];

  // Roving tabindex: the "anchor" for focus is the currently-selected star,
  // or the first star when unrated. This way Tab lands on the group at a
  // sensible place, and arrow keys navigate within.
  const anchorIndex = current > 0 ? current - 1 : 0;

  const commit = (n: number) => {
    if (!onChange) return;
    onChange(n);
    // After committing, focus follows the new anchor so repeated arrow-key
    // presses keep working without re-tabbing. If clearing (n=0), focus
    // stays on the first star.
    const focusIdx = n > 0 ? n - 1 : 0;
    requestAnimationFrame(() => buttonRefs.current[focusIdx]?.focus());
  };

  const handleClick = (n: number) => {
    if (readOnly || !onChange) return;
    // Click the current rating to clear it. Otherwise, set to n.
    commit(n === current ? 0 : n);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (readOnly || !onChange) return;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        e.preventDefault();
        commit(Math.min(current + 1, 5));
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        e.preventDefault();
        commit(Math.max(current - 1, 0));
        break;
      case 'Home':
        e.preventDefault();
        commit(1);
        break;
      case 'End':
        e.preventDefault();
        commit(5);
        break;
      case '0':
        e.preventDefault();
        commit(0);
        break;
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
        e.preventDefault();
        commit(Number(e.key));
        break;
    }
  };

  return (
    <div
      role={readOnly ? undefined : 'radiogroup'}
      aria-label={ariaLabel ?? (readOnly ? `Rated ${current} of 5 stars` : 'Rate this asset')}
      className={cn('flex items-center', gap, className)}
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map((n, idx) => {
        const filled = n <= displayed;
        const isAnchor = idx === anchorIndex;
        return (
          <button
            key={n}
            type="button"
            ref={(el) => {
              buttonRefs.current[idx] = el;
            }}
            role={readOnly ? undefined : 'radio'}
            aria-checked={readOnly ? undefined : n === current}
            disabled={readOnly}
            // Roving tabindex: only the anchor star accepts Tab focus; the
            // rest are reachable via arrow keys once the group is focused.
            tabIndex={readOnly ? -1 : isAnchor ? 0 : -1}
            onClick={() => handleClick(n)}
            onKeyDown={handleKeyDown}
            onMouseEnter={() => !readOnly && setHover(n)}
            className={cn(
              'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-frame-accent focus-visible:ring-offset-1 focus-visible:ring-offset-frame-card rounded',
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
