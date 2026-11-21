'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Film,
  Info,
  Play,
  Trash2,
  Tv,
  X,
} from 'lucide-react';
import type { ProgressRecord } from '@/lib/watch-progress';
import { getProgressRatio } from '@/lib/watch-progress';
import { detailsHref, episodeCode, relativeTime, watchHref } from '@/lib/media-links';
import { cn, formatTime } from '@/lib/utils';

interface ContinueWatchingRailProps {
  items: ProgressRecord[];
  onRemove: (titleId: string) => void;
  onClear: () => void;
}

function progressLabel(record: ProgressRecord) {
  if (!record.duration) return 'Resume';
  const remaining = Math.max(0, record.duration - record.currentTime);
  return remaining > 0 ? `${formatTime(remaining)} left` : 'Resume';
}

export default function ContinueWatchingRail({ items, onRemove, onClear }: ContinueWatchingRailProps) {
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

  if (!items.length) return null;

  const scroll = (direction: 1 | -1) => {
    const element = scrollerRef.current;
    if (!element) return;
    element.scrollBy({ left: direction * Math.max(480, element.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <section className="space-y-1">
      <div className="flex items-center justify-between gap-3 pb-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-4 w-1 shrink-0 rounded-sm bg-[#e50914]" />
          <h2 className="truncate text-base font-bold tracking-tight text-white sm:text-lg">
            Continue watching
          </h2>
          <span className="hidden rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-300 sm:inline">
            {items.length}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-neutral-400 transition hover:bg-white/5 hover:text-red-400"
            title="Clear all watch progress"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>

          <div className="hidden items-center gap-1 border-l border-white/10 pl-2 sm:flex">
            <button
              type="button"
              onClick={() => scroll(-1)}
              disabled={!canScrollLeft}
              aria-label="Scroll continue watching left"
              className="rounded-lg border border-white/5 bg-white/5 p-1.5 text-neutral-300 transition hover:bg-white/15 hover:text-white active:scale-95 disabled:cursor-default disabled:opacity-30"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => scroll(1)}
              disabled={!canScrollRight}
              aria-label="Scroll continue watching right"
              className="rounded-lg border border-white/5 bg-white/5 p-1.5 text-neutral-300 transition hover:bg-white/15 hover:text-white active:scale-95 disabled:cursor-default disabled:opacity-30"
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
          aria-label="Continue watching"
        >
          {items.map((record) => {
            const artwork = record.backdropUrl || record.posterUrl;
            const percent = Math.round(getProgressRatio(record) * 100);
            const code = record.kind === 'series' ? episodeCode(record.season, record.episode) : '';
            const resumeHref = watchHref(record.titleId, { episode: record.episodeId });

            return (
              <article
                key={record.titleId}
                className="group relative flex w-[220px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-white/10 bg-[#141416] shadow-lg transition-all hover:border-[#e50914]/60 sm:w-[260px]"
              >
                <div className="relative aspect-video w-full overflow-hidden bg-[#18181b]">
                  <Link href={resumeHref} className="absolute inset-0 z-0 block" aria-label={`Resume ${record.title}`}>
                    {artwork ? (
                      <img
                        src={artwork}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-neutral-900 text-neutral-500">
                        {record.kind === 'series' ? <Tv className="h-8 w-8" /> : <Film className="h-8 w-8" />}
                      </span>
                    )}
                    <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
                  </Link>

                  <button
                    type="button"
                    onClick={() => onRemove(record.titleId)}
                    title="Remove from continue watching"
                    aria-label={`Remove ${record.title} from continue watching`}
                    className="absolute right-2 top-2 z-20 rounded-full bg-black/60 p-1 text-white/80 backdrop-blur-sm transition hover:bg-red-600 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>

                  <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1.5">
                    {code ? (
                      <span className="rounded bg-[#e50914] px-2 py-0.5 text-[10px] font-black text-white shadow">
                        {code}
                      </span>
                    ) : (
                      <span className="rounded border border-white/10 bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white">
                        Movie
                      </span>
                    )}
                  </div>

                  <span className="pointer-events-none absolute bottom-2 left-2 z-10 flex items-center gap-1 text-[10px] font-medium text-neutral-300">
                    <Clock3 className="h-3 w-3" />
                    {relativeTime(record.updatedAt)}
                  </span>

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-2 pb-1.5">
                    <div className="progress-track bg-black/60">
                      <div className="progress-fill" style={{ width: `${Math.max(percent, 1)}%` }} />
                    </div>
                  </div>
                </div>

                <div className="flex flex-1 flex-col justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <Link
                      href={resumeHref}
                      className="block truncate text-xs font-bold text-white transition group-hover:text-[#e50914] sm:text-sm"
                      title={record.title}
                    >
                      {record.title}
                    </Link>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-neutral-400">
                      <span className="truncate">{progressLabel(record)}</span>
                      {percent > 0 ? (
                        <>
                          <span className="text-white/15">·</span>
                          <span className="shrink-0 tabular-nums">{percent}%</span>
                        </>
                      ) : null}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Link
                      href={resumeHref}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#e50914] px-3 py-1.5 text-xs font-bold text-white shadow-md transition hover:bg-red-700 active:scale-95"
                    >
                      <Play className="h-3.5 w-3.5 fill-white" />
                      Resume
                    </Link>
                    <Link
                      href={detailsHref(record.titleId)}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-neutral-300 transition hover:bg-white/10 hover:text-white active:scale-95"
                    >
                      <Info className="h-3 w-3" />
                      Details
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {canScrollLeft ? (
          <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#0d0d0e]/85 to-transparent" />
        ) : null}
        {canScrollRight ? (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#0d0d0e]/85 to-transparent" />
        ) : null}
      </div>
    </section>
  );
}
