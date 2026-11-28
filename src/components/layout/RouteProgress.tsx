'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Thin progress bar shown as soon as an internal link is clicked, so slow page
 * loads never look frozen. It hides when the new route has rendered.
 */
export default function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [active, setActive] = useState(false);
  const safetyTimer = useRef<number | null>(null);

  useEffect(() => {
    setActive(false);
    if (safetyTimer.current) window.clearTimeout(safetyTimer.current);
  }, [routeKey]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      // Runs in the capture phase: Next's Link calls preventDefault later, so it cannot be checked here.
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest('a');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname.startsWith('/api/')) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setActive(true);
      if (safetyTimer.current) window.clearTimeout(safetyTimer.current);
      // Never leave the bar stuck if the navigation is cancelled.
      safetyTimer.current = window.setTimeout(() => setActive(false), 12_000);
    };
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      if (safetyTimer.current) window.clearTimeout(safetyTimer.current);
    };
  }, []);

  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[120] h-[3px]" role="progressbar" aria-label="Loading page">
      <div className="route-progress-bar h-full w-full bg-accent shadow-[0_0_10px_rgba(229,9,20,0.7)]" />
    </div>
  );
}
