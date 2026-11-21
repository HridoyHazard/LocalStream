import { cn } from '@/lib/utils';

export function MediaCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="skeleton aspect-[2/3] w-full rounded-xl" />
      <div className="skeleton mt-2 h-3 w-4/5 rounded-full" />
      <div className="skeleton mt-1.5 h-2.5 w-1/2 rounded-full" />
    </div>
  );
}

export function MediaGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, index) => (
        <MediaCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function MediaRowSkeleton({ count = 7 }: { count?: number }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-4 w-1 rounded-sm bg-white/10" />
          <div className="skeleton h-4 w-36 rounded-full" />
        </div>
        <div className="skeleton h-3 w-16 rounded-full" />
      </div>
      <div className="scrollbar-none flex gap-3 overflow-hidden pb-3 sm:gap-4">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className="w-[145px] shrink-0 sm:w-[170px] md:w-[185px]">
            <MediaCardSkeleton />
          </div>
        ))}
      </div>
    </div>
  );
}
