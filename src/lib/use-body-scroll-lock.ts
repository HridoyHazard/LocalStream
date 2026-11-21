'use client';

import { useEffect } from 'react';

let lockCount = 0;
let previousOverflow = '';

/**
 * Locks body scrolling while an overlay is open. The lock is reference counted
 * so overlapping overlays (for example, the mobile drawer opening search) can
 * close in any order without leaving the page stuck.
 */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;

    if (lockCount === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        document.body.style.overflow = previousOverflow;
      }
    };
  }, [locked]);
}
