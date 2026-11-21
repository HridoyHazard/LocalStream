'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  ChevronRight,
  Clapperboard,
  FolderHeart,
  Layers,
  Sparkles,
  Tv,
} from 'lucide-react';
import type { StatsResponse } from '@/lib/media/types';
import { useApi } from '@/lib/use-api';
import PageHeader from '@/components/ui/PageHeader';
import { cn, formatCount } from '@/lib/utils';

type Kind = 'movie' | 'series';

function decadeOf(year: number) {
  return Math.floor(year / 10) * 10;
}

export default function GenresView() {
  const [kind, setKind] = useState<Kind>('movie');
  const { data, loading } = useApi<StatsResponse>('/api/stats');
  const facets = data?.facets[kind === 'movie' ? 'movies' : 'series'];
  const stats = data?.stats;

  const decades = useMemo(() => {
    const counts = new Map<number, number>();
    for (const year of facets?.years ?? []) {
      const decade = decadeOf(year);
      counts.set(decade, (counts.get(decade) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[0] - a[0]);
  }, [facets?.years]);

  const base = kind === 'movie' ? '/movies' : '/series';

  return (
    <div>
      <PageHeader
        eyebrow="Discover by mood"
        title="Genres & collections"
        description="Jump into a genre, a decade or one of the themed folders already organised on your media server. Every collection is built from the real library structure."
        statValue={stats ? (kind === 'movie' ? stats.movies : stats.series).toLocaleString() : '—'}
        statLabel={kind === 'movie' ? 'Films to explore' : 'Series to explore'}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip !h-8">
            <Layers className="h-3 w-3 text-accent-300" />
            {formatCount(data?.collections.length ?? 0, 'server collection')}
          </span>
          <span className="chip !h-8">{formatCount(facets?.years.length ?? 0, 'release year')}</span>
        </div>
      </PageHeader>

      <div className="container-page py-9 sm:py-11">
        <div className="mb-8 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setKind('movie')}
            className={cn('chip !h-9 text-[0.72rem]', kind === 'movie' && 'chip-active')}
          >
            <Clapperboard className="h-3.5 w-3.5" />
            Movies
            {stats ? <span className="opacity-50">{stats.movies.toLocaleString()}</span> : null}
          </button>
          <button
            type="button"
            onClick={() => setKind('series')}
            className={cn('chip !h-9 text-[0.72rem]', kind === 'series' && 'chip-active')}
          >
            <Tv className="h-3.5 w-3.5" />
            TV Series
            {stats ? <span className="opacity-50">{stats.series.toLocaleString()}</span> : null}
          </button>
        </div>

        <section>
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Browse by mood</p>
              <h2 className="section-heading mt-2">Genres</h2>
            </div>
            <span className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-white/20">
              {facets?.genres.length ?? 0} available
            </span>
          </div>

          {loading ? (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="skeleton h-20 rounded-2xl" />
              ))}
            </div>
          ) : facets && facets.genres.length > 0 ? (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {facets.genres.map((genre) => (
                <Link
                  key={genre}
                  href={`${base}?genre=${encodeURIComponent(genre)}`}
                  className="group relative flex items-center justify-between overflow-hidden rounded-2xl border border-white/[0.075] bg-white/[0.025] px-5 py-5 transition-colors hover:border-white/[0.16] hover:bg-white/[0.045]"
                >
                  <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-accent/[0.08] blur-2xl transition-opacity group-hover:opacity-100" />
                  <span className="relative">
                    <span className="block text-[1.05rem] font-bold tracking-tight text-white/85">{genre}</span>
                    <span className="mt-0.5 block text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-white/25">
                      {kind === 'movie' ? 'Movies' : 'TV series'}
                    </span>
                  </span>
                  <ChevronRight className="relative h-4 w-4 text-white/20 transition-transform group-hover:translate-x-0.5 group-hover:text-white/60" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-accent-300/80">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[0.82rem] font-semibold text-white/70">Genres appear when metadata is available</p>
                  <p className="mt-1.5 max-w-2xl text-[0.72rem] leading-relaxed text-white/35">
                    Your server folders do not carry genre tags. Add a TMDB API key in the environment and LocalStream
                    will enrich titles automatically; until then, use the collections and decades below — they come
                    straight from your real folder structure.
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="mt-12">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">A trip through time</p>
              <h2 className="section-heading mt-2">By decade</h2>
            </div>
            <span className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-white/20">
              {decades.length} decades
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {decades.map(([decade]) => (
              <Link
                key={decade}
                href={`${base}?decade=${decade}`}
                className="group relative overflow-hidden rounded-2xl border border-white/[0.075] bg-white/[0.022] px-4 py-5 transition-colors hover:border-white/[0.16] hover:bg-white/[0.045]"
              >
                <CalendarDays className="h-3.5 w-3.5 text-accent-300/70" />
                <span className="mt-3 block font-display text-[2rem] leading-none tracking-wide text-white/20 transition-colors group-hover:text-white/40">
                  {decade}s
                </span>
                <span className="mt-1.5 flex items-center gap-1 text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-white/25">
                  Explore
                  <ChevronRight className="h-2.5 w-2.5" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Straight from the server</p>
              <h2 className="section-heading mt-2">Collections</h2>
            </div>
            <span className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-white/20">
              {formatCount(data?.collections.length ?? 0, 'folder')}
            </span>
          </div>

          {loading ? (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="skeleton h-16 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {(data?.collections ?? []).map((collection) => (
                <Link
                  key={collection.name}
                  href={`${base}?category=${encodeURIComponent(collection.name)}`}
                  className="group flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.022] px-4 py-3.5 transition-colors hover:border-white/[0.15] hover:bg-white/[0.045]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <FolderHeart className="h-4 w-4 shrink-0 text-white/30" />
                    <span className="truncate text-[0.78rem] font-semibold text-white/70 group-hover:text-white">
                      {collection.name}
                    </span>
                  </span>
                  <span className="shrink-0 text-[0.6rem] font-bold tabular-nums text-white/25">
                    {collection.count.toLocaleString()}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className="mt-10 rounded-2xl border border-white/[0.06] bg-white/[0.018] p-5">
          <p className="text-[0.7rem] leading-relaxed text-white/30">
            Collections mirror the top-level folders on your media server, so they stay accurate after every scan. Use
            the filters on the Movies or TV Series pages for finer discovery by year, language and genre.
          </p>
        </div>
      </div>
    </div>
  );
}
