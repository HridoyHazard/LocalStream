import { Suspense } from 'react';
import BrowseView from '@/components/browse/BrowseView';
import BrowseFallback from '@/components/browse/BrowseFallback';

export default function MoviesPage() {
  // BrowseView calls useSearchParams(); Next 15 fails `next build` without a Suspense boundary.
  return (
    <Suspense fallback={<BrowseFallback />}>
      <BrowseView
        kind="movie"
        eyebrow="Feature presentations"
        title="Movies"
        description="Every film on your server, beautifully arranged and ready to play. Browse the complete local collection — no internet required."
      />
    </Suspense>
  );
}
