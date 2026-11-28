'use client';

import type { TitleSummary } from '@/lib/media/types';
import MediaCard from '@/components/media/MediaCard';
import { cn } from '@/lib/utils';

interface MediaGridProps {
  items: TitleSummary[];
  className?: string;
  animate?: boolean;
  progressFor?: (item: TitleSummary) => number | undefined;
}

export default function MediaGrid({ items, className, animate = false, progressFor }: MediaGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-x-3.5 gap-y-7 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-5 lg:gap-y-9 xl:grid-cols-6',
        className,
      )}
    >
      {items.map((item, index) => (
        <div
          key={`${item.id}-${index}`}
          className={animate ? 'animate-fade-up' : undefined}
          style={animate ? { animationDelay: `${Math.min(index, 12) * 30}ms` } : undefined}
        >
          <MediaCard item={item} progress={progressFor?.(item)} />
        </div>
      ))}
    </div>
  );
}
