import { MediaGridSkeleton } from '@/components/media/Skeletons';

/** Shown while a browse page hydrates, so /movies and /series never flash blank. */
export default function BrowseFallback() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="border-b border-white/[0.06]">
        <div className="container-page py-10 sm:py-14">
          <div className="skeleton h-3 w-32 rounded-full" />
          <div className="skeleton mt-4 h-10 w-64 rounded-xl" />
          <div className="skeleton mt-4 h-3 w-[min(32rem,80%)] rounded-full" />
        </div>
      </div>
      <div className="container-page py-8 sm:py-10">
        <div className="skeleton mb-8 h-12 w-full rounded-full" />
        <MediaGridSkeleton count={12} />
      </div>
    </div>
  );
}
