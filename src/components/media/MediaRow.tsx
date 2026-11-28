'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { TitleSummary } from '@/lib/media/types';
import MediaCard from '@/components/media/MediaCard';
import { MediaRowSkeleton } from '@/components/media/Skeletons';
import { cn } from '@/lib/utils';

interface MediaRowProps {
  eyebrow?: string;
  title: string;
  items: TitleSummary[];
  loading?: boolean;
  actionHref?: string;
  actionLabel?: string;
  progressFor?: (item: TitleSummary) => number | undefined;
  metaFor?: (item: TitleSummary) => string | undefined;
  episodeLabelFor?: (item: TitleSummary) => string | undefined;
  onRemove?: (item: TitleSummary) => void;
  cardClassName?: string;
  className?: string;
}

export default function MediaRow({
  eyebrow,
  title,
  items,
  loading = false,
  actionHref,
  actionLabel = 'Explore all',
  progressFor,
  metaFor,
  episodeLabelFor,
  onRemove,
  cardClassName,
  className,
}: MediaRowProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const element = scrollerRef.current;
    if (!element) return;
    setCanScrollLeft(element.scrollLeft > 8);
    setCanScrollRight(element.scrollLeft + element.clientWidth < element.scrollWidth - 8);
  }, []);

  useEffect(() => {
    updateScrollState();
    const element = scrollerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(element);
    return () => observer.disconnect();
  }, [updateScrollState, items.length]);

  const scroll = (direction: 1 | -1) => {
    const element = scrollerRef.current;
    if (!element) return;
    element.scrollBy({ left: direction * Math.max(480, element.clientWidth * 0.8), behavior: 'smooth' });
  };

  if (loading) {
    return (
      <section className={cn(className)}>
        <MediaRowSkeleton />
      </section>
    );
  }

  if (!items.length) return null;

  return (
    <section className={cn(className)}>
      <div className="flex items-baseline gap-4 pb-2">
        <h2 className="section-heading min-w-0 truncate" title={eyebrow}>
          {title}
        </h2>
        <span aria-hidden="true" className="h-px min-w-6 flex-1 self-center bg-white/[0.09]" />

        <div className="flex shrink-0 items-center gap-2 self-center">
          {actionHref ? (
            <Link
              href={actionHref}
              className="group inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-neutral-400 transition hover:bg-white/5 hover:text-white"
            >
              <span>{actionLabel}</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : null}

          <div className="hidden items-center gap-1 pl-1 sm:flex">
            <button
              type="button"
              onClick={() => scroll(-1)}
              disabled={!canScrollLeft}
              aria-label={`Scroll ${title} left`}
              className="rounded-lg bg-white/5 p-1.5 text-neutral-300 transition hover:bg-white/15 hover:text-white active:scale-95 disabled:cursor-default disabled:opacity-30"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => scroll(1)}
              disabled={!canScrollRight}
              aria-label={`Scroll ${title} right`}
              className="rounded-lg bg-white/5 p-1.5 text-neutral-300 transition hover:bg-white/15 hover:text-white active:scale-95 disabled:cursor-default disabled:opacity-30"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative -mx-[var(--page-x)]">
        <div
          ref={scrollerRef}
          onScroll={updateScrollState}
          className="scrollbar-none flex snap-x gap-3 overflow-x-auto px-[var(--page-x)] pb-3 pt-1 sm:gap-4"
          role="region"
          aria-label={title}
        >
          {items.map((item, index) => (
            <div
              key={`${item.id}-${index}`}
              className={cn('w-[145px] shrink-0 snap-start sm:w-[170px] md:w-[185px]', cardClassName)}
            >
              <MediaCard
                item={item}
                progress={progressFor?.(item)}
                metaOverride={metaFor?.(item)}
                episodeLabel={episodeLabelFor?.(item)}
                onRemove={onRemove ? () => onRemove(item) : undefined}
              />
            </div>
          ))}

          {actionHref ? (
            <div className="flex w-[145px] shrink-0 snap-start flex-col sm:w-[170px] md:w-[185px]">
              <Link
                href={actionHref}
                className="group flex aspect-[2/3] w-full flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-white/15 bg-[#141416]/50 p-4 text-center shadow-sm transition-all hover:border-[#e50914] hover:bg-[#1c1c20] active:scale-95"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white shadow transition-all group-hover:bg-[#e50914]">
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                </span>
                <span>
                  <span className="block text-xs font-bold text-white transition group-hover:text-red-400">
                    View all {items.length}+
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-neutral-400">in {title}</span>
                </span>
              </Link>
            </div>
          ) : null}
        </div>

        {canScrollLeft ? (
          <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#0d0d0e]/80 to-transparent" />
        ) : null}
        {canScrollRight ? (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#0d0d0e]/80 to-transparent" />
        ) : null}
      </div>
    </section>
  );
}
