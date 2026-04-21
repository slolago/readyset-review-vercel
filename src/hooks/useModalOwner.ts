'use client';

import { useEffect } from 'react';

// Module-scope stack counter. Tracks how many modal-layer owners are currently
// mounted. The first owner sets `document.body.dataset.modalOpen = 'true'`;
// the last to unmount clears it.
let count = 0;

/**
 * Registers the caller as an owner of the global "modal layer". While any
 * owner is active, `document.body.dataset.modalOpen === 'true'` — viewer
 * keydown handlers use this flag to early-return and avoid reacting to
 * shortcuts that belong to the modal on top.
 */
export function useModalOwner(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (typeof document === 'undefined') return;

    count++;
    if (count === 1) {
      document.body.dataset.modalOpen = 'true';
    }

    return () => {
      count = Math.max(0, count - 1);
      if (count === 0) {
        delete document.body.dataset.modalOpen;
      }
    };
  }, [active]);
}
