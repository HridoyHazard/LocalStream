import { Suspense } from 'react';
import BrowseView from '@/components/browse/BrowseView';

export default function SeriesPage() {
  // BrowseView calls useSearchParams(); Next 15 fails `next build` without a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <BrowseView
        kind="series"
        eyebrow="Episodic storytelling"
        title="TV Series"
        description="Every season and episode in your local library, ready for the next binge. Pick up an episode and stream it instantly."
      />
    </Suspense>
  );
}
