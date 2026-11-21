'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Bookmark, Check, ChevronLeft, ChevronRight, Info, Play, Star } from 'lucide-react';
import type { TitleSummary } from '@/lib/media/types';
import { getPosterPalette, paletteStyle } from '@/lib/design/palette';
import { detailsHref, episodeCode, qualityLabel, watchHref } from '@/lib/media-links';
import { formatTime } from '@/lib/utils';
import { getProgress, getProgressRatio, subscribeToProgress } from '@/lib/watch-progress';
import { isInWatchlist, subscribeToWatchlist, toggleWatchlist } from '@/lib/watchlist';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';

interface HeroProps {
  items: TitleSummary[];
  loading?: boolean;
  online?: boolean;
}

const ROTATION_MS = 7000;

function heroImage(item: TitleSummary) {
  return item.backdropUrl || item.posterUrl;
}

function HeroSkeleton() {
  return (
    <section
      className="relative min-h-[420px] overflow-hidden rounded-2xl border border-white/10 bg-[#18181b] sm:min-h-[440px] md:min-h-[480px]"
      aria-busy="true"
      aria-label="Loading featured titles"
    >
      <div className="absolute inset-0 bg-[radial-gradient(90%_120%_at_78%_8%,#241318_0%,transparent_56%),linear-gradient(152deg,#12090b_0%,#0d0d0e_65%)]" />
      <div className="relative flex h-full min-h-[420px] items-end p-5 sm:min-h-[440px] sm:p-8 md:min-h-[480px] md:p-10">
        <div className="max-w-xl">
          <div className="skeleton h-5 w-40 rounded" />
          <div className="mt-4 space-y-2.5">
            <div className="skeleton h-9 w-[80%] rounded-lg sm:h-12" />
            <div className="skeleton h-9 w-[52%] rounded-lg sm:h-12" />
          </div>
          <div className="mt-5 space-y-2">
            <div className="skeleton h-3 w-[70%] rounded-full" />
            <div className="skeleton h-3 w-[48%] rounded-full" />
          </div>
          <div className="mt-6 flex gap-2.5">
            <div className="skeleton h-11 w-32 rounded-xl" />
            <div className="skeleton h-11 w-28 rounded-xl" />
            <div className="skeleton h-11 w-11 rounded-xl" />
          </div>
        </div>
      </div>
    </section>
  );
}

function SlideWatchlistButton({ item }: { item: TitleSummary }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(isInWatchlist(item.id));
    return subscribeToWatchlist(() => setSaved(isInWatchlist(item.id)));
  }, [item.id]);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        setSaved(toggleWatchlist(item));
      }}
      className={`flex min-h-[42px] items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold backdrop-blur-sm transition active:scale-95 sm:px-4 sm:text-sm ${
        saved
          ? 'border-red-500/40 bg-red-600/20 text-[#ff4b55]'
          : 'border-white/10 bg-white/10 text-white hover:bg-white/15'
      }`}
      title={saved ? 'Saved in watchlist' : 'Add to watchlist'}
      aria-label={saved ? 'Saved in watchlist' : 'Add to watchlist'}
    >
      {saved ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
      <span className="hidden sm:inline">{saved ? 'Saved' : 'Watchlist'}</span>
    </button>
  );
}

function SlideContent({
  item,
  incoming,
  online,
}: {
  item: TitleSummary;
  incoming: boolean;
  online: boolean;
}) {
  const [resume, setResume] = useState<{ time: number; duration: number; episode: string | null } | null>(null);

  useEffect(() => {
    const read = () => {
      const saved = getProgress(item.id);
      if (saved && saved.currentTime > 10) {
        setResume({
          time: saved.currentTime,
          duration: saved.duration ?? 0,
          episode:
            item.kind === 'series' && saved.season && saved.episode
              ? `Resume ${episodeCode(saved.season, saved.episode)}`
              : null,
        });
      } else {
        setResume(null);
      }
    };
    read();
    return subscribeToProgress(read);
  }, [item]);

  const resumePercent = resume?.duration ? Math.round(getProgressRatio({ currentTime: resume.time, duration: resume.duration }) * 100) : 0;
  const quality = qualityLabel(item);
  const animation = (delay: number): CSSProperties | undefined =>
    incoming
      ? { animation: `heroTextSlideIn 600ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms both` }
      : undefined;

  return (
    <div className="relative z-10 flex h-full flex-col justify-end p-5 sm:p-8 md:p-10">
      <div className="max-w-2xl space-y-3 sm:space-y-3.5">
        <div className="flex flex-wrap items-center gap-2" style={animation(40)}>
          <span className="rounded bg-[#e50914] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow sm:text-[11px]">
            Featured
          </span>
          <span className="rounded border border-white/10 bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white sm:text-[11px]">
            {quality}
          </span>
          {item.year ? <span className="text-xs font-medium text-neutral-300">{item.year}</span> : null}
          {item.rating ? (
            <span className="flex items-center gap-1 rounded border border-amber-500/20 bg-amber-950/40 px-2 py-0.5 text-xs font-bold text-amber-400">
              <Star className="h-3 w-3 fill-amber-400" />
              {item.rating.toFixed(1)} <span className="text-[9px] font-semibold text-amber-400/70">TMDB</span>
            </span>
          ) : null}
          {item.kind === 'series' ? (
            <span className="rounded border border-white/10 bg-black/50 px-2 py-0.5 text-[10px] font-medium text-neutral-300">
              {item.seasonCount ? `${item.seasonCount} season${item.seasonCount === 1 ? '' : 's'}` : 'Series'}
            </span>
          ) : null}
        </div>

        <h1
          className="line-clamp-2 text-2xl font-black leading-tight tracking-tight text-white drop-shadow-lg sm:text-4xl md:text-5xl"
          style={animation(90)}
        >
          {item.title}
        </h1>

        <p
          className="line-clamp-2 max-w-xl text-xs leading-relaxed text-neutral-300 drop-shadow sm:line-clamp-3 sm:text-sm"
          style={animation(140)}
        >
          {item.overview ||
            (item.kind === 'series'
              ? `${item.episodeCount ?? 0} episode${item.episodeCount === 1 ? '' : 's'} ready to stream from your local media server in original quality.`
              : 'A featured film from your local library, streaming directly from your media server in original quality.')}
        </p>

        {resume ? (
          <div className="flex max-w-xs items-center gap-2.5" style={animation(170)}>
            <div className="progress-track flex-1 bg-black/45">
              <div className="progress-fill" style={{ width: `${Math.max(resumePercent, 2)}%` }} />
            </div>
            <span className="shrink-0 text-[10px] font-semibold tabular-nums text-white/60">
              {resume.episode ? `${resume.episode} · ` : resumePercent ? `${resumePercent}% · ` : ''}
              {formatTime(resume.time)}
            </span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2.5 pt-1.5 sm:flex-nowrap sm:gap-3.5" style={animation(190)}>
          <Link
            href={watchHref(item)}
            className="flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#e50914] px-5 py-2.5 text-xs font-bold text-white shadow-xl shadow-red-950/50 transition hover:bg-red-700 active:scale-95 focus-visible:ring-2 focus-visible:ring-white sm:flex-initial sm:px-6 sm:py-3 sm:text-sm"
          >
            <Play className="h-4 w-4 fill-white" />
            <span>{resume ? 'Resume' : 'Play now'}</span>
          </Link>

          <Link
            href={detailsHref(item)}
            className="flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/15 active:scale-95 sm:px-5 sm:py-3 sm:text-sm"
            title="Stream details"
          >
            <Info className="h-4 w-4 text-neutral-300" />
            <span className="hidden sm:inline">More info</span>
          </Link>

          <SlideWatchlistButton item={item} />

          <span className="ml-1 hidden items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40 lg:flex">
            <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {online ? 'Direct local stream' : 'Connecting…'}
          </span>
        </div>
      </div>
    </div>
  );
}

function SlideItem({
  item,
  incoming,
  style,
  online,
}: {
  item: TitleSummary;
  incoming: boolean;
  style?: CSSProperties;
  online: boolean;
}) {
  const palette = getPosterPalette(`${item.title}-${item.year ?? ''}`);
  const image = heroImage(item);

  return (
    <div style={style} className="absolute inset-0 flex h-full w-full items-end overflow-hidden will-change-transform">
      {image ? (
        <>
          <img
            src={image}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full scale-110 object-cover object-center opacity-45 blur-2xl"
          />
          <img
            src={image}
            alt=""
            draggable={false}
            className="absolute right-0 top-0 hidden h-full w-auto max-w-[78%] object-cover object-top opacity-90 [mask-image:linear-gradient(to_left,black_38%,rgba(0,0,0,0.55)_62%,transparent_94%)] sm:block"
          />
        </>
      ) : (
        <div className="absolute inset-0" style={paletteStyle(palette)}>
          <div className="hero-art" />
          <div className="hero-orb !left-[72%] !top-[18%]" />
          <div className="hero-grid" />
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0e0e0f] via-[#0e0e0f]/80 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0e0e0f] via-[#0e0e0f]/65 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_100%_at_85%_20%,rgba(255,255,255,0.05),transparent_55%)]" />

      <SlideContent item={item} incoming={incoming} online={online} />
    </div>
  );
}

export default function Hero({ items, loading = false, online = true }: HeroProps) {
  const featured = useMemo(() => {
    const score = (item: TitleSummary) => {
      const title = item.title.trim();
      if (!title) return 2;
      if (/^\d{1,3}$/.test(title)) return 2;
      if (/^\d{1,3}\s*[-–.]\s+/.test(title)) return 1;
      return 0;
    };
    const ranked = [...items].sort((a, b) => score(a) - score(b));

    const unique: TitleSummary[] = [];
    const seen = new Set<string>();
    for (const item of ranked) {
      const key = item.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
      if (unique.length === 8) break;
    }
    return unique;
  }, [items]);

  const [index, setIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const [animating, setAnimating] = useState(false);
  const [paused, setPaused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const animationTimer = useRef<number | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const count = featured.length;
  const active = featured[Math.min(index, Math.max(count - 1, 0))];

  useEffect(() => {
    if (index > count - 1) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    return () => {
      if (animationTimer.current) window.clearTimeout(animationTimer.current);
    };
  }, []);

  const goToSlide = useCallback(
    (nextIndex: number, dir: 'next' | 'prev') => {
      if (count <= 1 || animating || nextIndex === index) return;
      setPrevIndex(index);
      setIndex(nextIndex);
      setDirection(dir);
      setAnimating(true);
      if (animationTimer.current) window.clearTimeout(animationTimer.current);
      animationTimer.current = window.setTimeout(() => {
        setAnimating(false);
        setPrevIndex(null);
      }, 550);
    },
    [animating, count, index],
  );

  const goNext = useCallback(() => {
    if (count <= 1) return;
    goToSlide((index + 1) % count, 'next');
  }, [count, goToSlide, index]);

  const goPrev = useCallback(() => {
    if (count <= 1) return;
    goToSlide((index - 1 + count) % count, 'prev');
  }, [count, goToSlide, index]);

  useEffect(() => {
    if (count <= 1 || paused || reducedMotion) return;
    const timer = window.setInterval(goNext, ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [count, goNext, paused, reducedMotion]);

  if (loading) return <HeroSkeleton />;
  if (!active) return null;

  const previous = prevIndex !== null ? featured[prevIndex] : null;

  return (
    <section
      className="group relative min-h-[420px] w-full touch-pan-y select-none overflow-hidden rounded-2xl border border-white/10 bg-[#18181b] shadow-2xl sm:min-h-[440px] md:min-h-[480px]"
      aria-roledescription="carousel"
      aria-label="Featured titles from your library"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={(event) => {
        setPaused(true);
        touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      }}
      onTouchEnd={(event) => {
        setPaused(false);
        const start = touchStart.current;
        touchStart.current = null;
        if (!start) return;
        const diffX = event.changedTouches[0].clientX - start.x;
        const diffY = event.changedTouches[0].clientY - start.y;
        if (Math.abs(diffX) >= 35 && Math.abs(diffX) > Math.abs(diffY)) {
          if (diffX < 0) goNext();
          else goPrev();
        }
      }}
      onTouchCancel={() => {
        setPaused(false);
        touchStart.current = null;
      }}
    >
      {animating && previous ? (
        <SlideItem
          key={`prev-${previous.id}`}
          item={previous}
          incoming={false}
          online={online}
          style={{
            animation:
              direction === 'next'
                ? 'heroSlideOutLeft 550ms cubic-bezier(0.22, 1, 0.36, 1) forwards'
                : 'heroSlideOutRight 550ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
          }}
        />
      ) : null}

      {active ? (
        <SlideItem
          key={`current-${active.id}-${index}`}
          item={active}
          incoming={animating}
          online={online}
          style={
            animating
              ? {
                  animation:
                    direction === 'next'
                      ? 'heroSlideInRight 550ms cubic-bezier(0.22, 1, 0.36, 1) forwards'
                      : 'heroSlideInLeft 550ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
                }
              : undefined
          }
        />
      ) : null}

      {count > 1 ? (
        <>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              goPrev();
            }}
            aria-label="Previous featured title"
            className="absolute left-3 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/50 p-2.5 text-white/80 opacity-0 shadow-xl backdrop-blur-sm transition-all duration-200 hover:bg-black/80 hover:text-white active:scale-95 group-hover:opacity-100 sm:flex"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              goNext();
            }}
            aria-label="Next featured title"
            className="absolute right-3 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/50 p-2.5 text-white/80 opacity-0 shadow-xl backdrop-blur-sm transition-all duration-200 hover:bg-black/80 hover:text-white active:scale-95 group-hover:opacity-100 sm:flex"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="absolute bottom-4 right-5 z-20 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-2.5 py-1 backdrop-blur-md sm:bottom-6 sm:right-8">
            {featured.map((item, dotIndex) => (
              <button
                key={`dot-${item.id}-${dotIndex}`}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (dotIndex === index) return;
                  goToSlide(dotIndex, dotIndex > index ? 'next' : 'prev');
                }}
                aria-label={`Jump to ${item.title}`}
                aria-current={dotIndex === index}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  dotIndex === index ? 'w-5 bg-[#e50914]' : 'w-1.5 bg-white/35 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
