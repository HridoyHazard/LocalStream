'use client';

import { memo, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bookmark, BookmarkCheck, Info, Play, Star, X } from 'lucide-react';
import type { TitleSummary } from '@/lib/media/types';
import { detailsHref, metaLine, qualityLabel, watchHref } from '@/lib/media-links';
import { isInWatchlist, subscribeToWatchlist, toggleWatchlist } from '@/lib/watchlist';
import { cn } from '@/lib/utils';
import Poster from '@/components/media/Poster';

interface MediaCardProps {
  item: TitleSummary;
  progress?: number;
  href?: string;
  playHref?: string;
  onRemove?: () => void;
  className?: string;
  priority?: boolean;
  metaOverride?: string;
  episodeLabel?: string;
}

function ratingLabel(value: number | null) {
  if (!value || value <= 0) return null;
  return (Math.round(value * 10) / 10).toFixed(1);
}

function MediaCard({
  item,
  progress,
  href,
  playHref,
  onRemove,
  className,
  priority,
  metaOverride,
  episodeLabel,
}: MediaCardProps) {
  const percentage = typeof progress === 'number' ? Math.round(Math.max(0, Math.min(1, progress)) * 100) : undefined;
  const destination = href ?? detailsHref(item);
  const playDestination = playHref ?? watchHref(item);
  const rating = ratingLabel(item.rating);
  const quality = qualityLabel(item);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(isInWatchlist(item.id));
    return subscribeToWatchlist(() => setSaved(isInWatchlist(item.id)));
  }, [item.id]);

  return (
    <article className={cn('group relative min-w-0 select-none', className)}>
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-white/5 bg-[#18181a] shadow-md transition-all duration-200 group-hover:border-[#e50914]/70 group-hover:shadow-xl group-hover:shadow-red-950/20">
        <Link
          href={destination}
          className="absolute inset-0 z-0 block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#e50914] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0d0e]"
          aria-label={`View details for ${item.title}`}
        >
          <Poster
            title={item.title}
            kind={item.kind}
            year={item.year}
            posterUrl={item.posterUrl}
            extension={item.kind === 'movie' ? 'FILM' : 'SERIES'}
            episodeLabel={episodeLabel}
            priority={priority}
          />
        </Link>

        <div className="pointer-events-none absolute left-2 top-2 z-10">
          <span className="rounded-md bg-black/65 px-2 py-0.5 text-[10px] font-bold text-white/85 backdrop-blur-sm">{quality}</span>
        </div>

        <div className="absolute right-2 top-2 z-20 flex items-center gap-1.5">
          {onRemove ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRemove();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white/70 opacity-0 backdrop-blur-md transition hover:bg-black/80 hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
              aria-label={`Remove ${item.title} from your list`}
              title="Remove from my list"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setSaved(toggleWatchlist(item));
            }}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full border backdrop-blur-md transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100',
              saved
                ? 'border-[#e50914]/40 bg-[#e50914]/25 text-red-200 sm:opacity-100'
                : 'border-white/15 bg-black/55 text-white/70 hover:bg-black/75 hover:text-white',
            )}
            aria-label={saved ? `Remove ${item.title} from watchlist` : `Add ${item.title} to watchlist`}
            title={saved ? 'Remove from watchlist' : 'Add to watchlist'}
          >
            {saved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
          </button>
        </div>

        {percentage !== undefined ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-2 pb-1.5">
            <div className="progress-track bg-black/50">
              <div className="progress-fill" style={{ width: `${Math.max(percentage, 2)}%` }} />
            </div>
          </div>
        ) : null}

        <div className="pointer-events-none absolute inset-0 z-10 flex items-end justify-between gap-2 bg-gradient-to-t from-black/90 via-black/25 to-transparent p-2.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
          <Link
            href={playDestination}
            aria-label={`Play ${item.title}`}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-lg bg-[#e50914] px-2.5 py-1.5 text-[11px] font-bold text-white shadow-lg transition hover:bg-red-700 active:scale-90"
          >
            <Play className="h-3.5 w-3.5 fill-white" />
            <span>Play</span>
          </Link>

          <Link
            href={destination}
            className="pointer-events-auto inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/60 px-2 py-1 text-[11px] font-semibold text-neutral-300 backdrop-blur-sm transition hover:text-white"
          >
            <Info className="h-3 w-3" />
            <span>Details</span>
          </Link>
        </div>
      </div>

      <div className="space-y-0.5 px-0.5 pt-2">
        <Link
          href={destination}
          className="block truncate text-xs font-semibold text-neutral-200 transition-colors group-hover:text-white sm:text-sm"
          title={item.title}
        >
          {item.title}
        </Link>

        <div className="flex items-center justify-between gap-2 text-xs text-neutral-400">
          <span className="truncate">{metaOverride ?? metaLine(item) ?? item.year ?? '—'}</span>
          {rating ? (
            <span className="flex shrink-0 items-center gap-1 font-medium text-amber-400">
              <Star className="h-3 w-3 fill-amber-400" />
              {rating}
            </span>
          ) : (
            <span className="shrink-0 font-mono text-[10px] text-neutral-500">{item.language ?? 'LAN'}</span>
          )}
        </div>
      </div>
    </article>
  );
}

// Typing in a filter box re-renders the page; memo keeps unchanged cards out of it.
export default memo(MediaCard);
