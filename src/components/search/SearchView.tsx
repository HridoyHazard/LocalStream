'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  Clapperboard,
  FilterX,
  Languages,
  LoaderCircle,
  RefreshCw,
  Search,
  Sparkles,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import type { BrowseResponse, SearchResponse, StatsResponse, TitleSummary } from '@/lib/media/types';
import { useApi, useDebouncedValue } from '@/lib/use-api';
import { detailsHref, metaLine, watchHref } from '@/lib/media-links';
import PageHeader from '@/components/ui/PageHeader';
import MediaGrid from '@/components/media/MediaGrid';
import { MediaGridSkeleton } from '@/components/media/Skeletons';
import EmptyState from '@/components/ui/EmptyState';
import Poster from '@/components/media/Poster';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type KindFilter = 'all' | 'movie' | 'series';

export interface SearchInitialFilters {
  kind?: string;
  year?: string;
  genre?: string;
  language?: string;
  actor?: string;
  director?: string;
}

interface SearchViewProps {
  initialQuery: string;
  initialFilters?: SearchInitialFilters;
}

const RECENT_KEY = 'localstream.searches.v1';

function readRecent(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}

function saveRecent(query: string) {
  if (!query.trim()) return;
  try {
    const next = [query.trim(), ...readRecent().filter((value) => value.toLowerCase() !== query.trim().toLowerCase())].slice(0, 8);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage errors.
  }
}

function SpotlightResult({ item }: { item: TitleSummary }) {
  return (
    <div className="group relative mb-8 overflow-hidden rounded-2xl border border-white/10 bg-[#151516]">
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[#e50914]/[0.09] blur-[80px]" />
      <div className="relative flex flex-col gap-5 p-4 sm:flex-row sm:items-center sm:p-5">
        <Link
          href={detailsHref(item)}
          className="relative block h-44 w-28 shrink-0 overflow-hidden rounded-xl border border-white/15 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.8)] sm:h-48 sm:w-32"
        >
          <Poster
            title={item.title}
            kind={item.kind}
            year={item.year}
            posterUrl={item.posterUrl}
            extension={item.kind === 'series' ? 'SERIES' : 'FILM'}
          />
        </Link>
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1.5 rounded bg-[#e50914] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            Top match
          </span>
          <Link href={detailsHref(item)} className="mt-2 block">
            <h2 className="text-[1.6rem] font-bold leading-tight tracking-[-0.02em] text-white transition-colors group-hover:text-[#ff6b73] sm:text-[2rem]">
              {item.title}
            </h2>
          </Link>
          <p className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.7rem] font-semibold text-white/45">
            <span>{metaLine(item)}</span>
            {item.rating ? (
              <>
                <span className="h-1 w-1 rounded-full bg-white/20" />
                <span className="text-amber-300">{item.rating.toFixed(1)} / 10</span>
              </>
            ) : null}
            {item.language ? (
              <>
                <span className="h-1 w-1 rounded-full bg-white/20" />
                <span>{item.language}</span>
              </>
            ) : null}
          </p>
          <p className="mt-3 line-clamp-3 max-w-2xl text-[0.82rem] leading-relaxed text-white/45">
            {item.overview || `${item.title} is available on your local media server and streams directly in original quality.`}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <Link href={watchHref(item)} className="btn btn-primary btn-sm">
              Play now
            </Link>
            <Link href={detailsHref(item)} className="btn btn-ghost btn-sm">
              View details
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SearchView({ initialQuery, initialFilters = {} }: SearchViewProps) {
  const [query, setQuery] = useState(initialQuery);
  const [kind, setKind] = useState<KindFilter>(
    initialFilters.kind === 'movie' || initialFilters.kind === 'series' ? initialFilters.kind : 'all',
  );
  const [year, setYear] = useState(initialFilters.year || 'all');
  const [genre, setGenre] = useState(initialFilters.genre || 'all');
  const [language, setLanguage] = useState(initialFilters.language || 'all');
  const [actor, setActor] = useState(initialFilters.actor || 'all');
  const [director, setDirector] = useState(initialFilters.director || 'all');
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), 220);

  const { data: statsData } = useApi<StatsResponse>('/api/stats');
  const { data: popularData } = useApi<BrowseResponse>('/api/titles?sort=popular&pageSize=12&facets=false');

  useEffect(() => {
    setRecent(readRecent());
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQuery) params.set('q', debouncedQuery);
    if (kind !== 'all') params.set('kind', kind);
    if (year !== 'all') params.set('year', year);
    if (genre !== 'all') params.set('genre', genre);
    if (language !== 'all') params.set('language', language);
    if (actor !== 'all') params.set('actor', actor);
    if (director !== 'all') params.set('director', director);
    const search = params.toString();
    window.history.replaceState(null, '', `/search${search ? `?${search}` : ''}`);
  }, [actor, debouncedQuery, director, genre, kind, language, year]);

  const searchPath = useMemo(() => {
    const filtered = [kind, year, genre, language, actor, director].some((value) => value !== 'all');
    if (!debouncedQuery && !filtered) return null;
    const params = new URLSearchParams({ limit: '80' });
    if (debouncedQuery) params.set('q', debouncedQuery);
    if (kind !== 'all') params.set('kind', kind);
    if (year !== 'all') params.set('year', year);
    if (genre !== 'all') params.set('genre', genre);
    if (language !== 'all') params.set('language', language);
    if (actor !== 'all') params.set('actor', actor);
    if (director !== 'all') params.set('director', director);
    return `/api/search?${params.toString()}`;
  }, [actor, debouncedQuery, director, genre, kind, language, year]);

  const { data, loading, error, refresh } = useApi<SearchResponse>(searchPath, {
    listenForRefresh: false,
    keepPreviousData: true,
  });
  const stale = Boolean(data && searchPath && data.query !== debouncedQuery);
  const showSkeleton = Boolean(searchPath) && (loading || stale) && !error;

  const facets = statsData?.facets[kind === 'movie' ? 'movies' : kind === 'series' ? 'series' : 'all'];
  const results = useMemo(() => data?.results ?? [], [data?.results]);
  const top = results[0];
  const rest = results.slice(1);
  const didYouMean =
    data?.didYouMean && data.didYouMean.toLowerCase() !== debouncedQuery.toLowerCase() ? data.didYouMean : null;

  const activeFilterCount = [
    kind !== 'all',
    year !== 'all',
    genre !== 'all',
    language !== 'all',
    actor !== 'all',
    director !== 'all',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setKind('all');
    setYear('all');
    setGenre('all');
    setLanguage('all');
    setActor('all');
    setDirector('all');
  };

  const runSearch = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    saveRecent(trimmed);
    setRecent(readRecent());
  };

  return (
    <div>
      <PageHeader
        eyebrow="Find anything"
        title="Search"
        description="Smart, typo-tolerant search across every title on your server. Search by name, year, actor, director or genre — results are ranked by relevance."
      >
        <form
          className="relative max-w-2xl"
          onSubmit={(event) => {
            event.preventDefault();
            runSearch(query);
          }}
        >
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#e50914]" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try “Avngers Endgame”, “Interstllar” or “Jhon Wick”…"
            className="h-12 w-full rounded-full border border-white/15 bg-white/[0.06] pl-11 pr-32 text-[0.92rem] font-medium text-white outline-none transition-colors placeholder:text-neutral-500 focus:border-[#e50914]/70 focus:bg-[#1a1a1e] focus:ring-2 focus:ring-[#e50914]/20"
            aria-label="Search the library"
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.07] text-white/40 transition-colors hover:bg-white/[0.12] hover:text-white"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <button type="submit" className="btn btn-primary btn-sm h-10">
              Search
            </button>
          </div>
        </form>
      </PageHeader>

      <div className="container-page py-8 sm:py-10">
        <div className="mb-8 space-y-3">
          <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
            {(
              [
                { value: 'all' as const, label: 'All titles' },
                { value: 'movie' as const, label: 'Movies' },
                { value: 'series' as const, label: 'Series' },
              ]
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setKind(option.value)}
                className={cn('chip !h-8 shrink-0 text-[0.7rem]', kind === option.value && 'chip-active')}
              >
                {option.value === 'movie' ? <Clapperboard className="h-3 w-3" /> : null}
                {option.label}
              </button>
            ))}

            <span className="mx-1 h-4 w-px shrink-0 bg-white/[0.08]" />

            <div className="relative flex h-8 shrink-0 items-center">
              <CalendarDays className="pointer-events-none absolute left-2.5 h-3 w-3 text-white/25" />
              <select
                value={year}
                onChange={(event) => setYear(event.target.value)}
                className="h-8 cursor-pointer appearance-none rounded-full border border-white/[0.08] bg-white/[0.035] pl-7 pr-7 text-[0.66rem] font-semibold text-white/50 outline-none transition-colors hover:border-white/[0.16] hover:text-white/80"
                aria-label="Filter by year"
              >
                <option value="all">Any year</option>
                {facets?.years.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 h-2.5 w-2.5 text-white/25" />
            </div>

            <div className="relative flex h-8 shrink-0 items-center">
              <Sparkles className="pointer-events-none absolute left-2.5 h-3 w-3 text-white/25" />
              <select
                value={genre}
                onChange={(event) => setGenre(event.target.value)}
                className="h-8 max-w-[11rem] cursor-pointer appearance-none rounded-full border border-white/[0.08] bg-white/[0.035] pl-7 pr-7 text-[0.66rem] font-semibold text-white/50 outline-none transition-colors hover:border-white/[0.16] hover:text-white/80"
                aria-label="Filter by genre"
              >
                <option value="all">Any genre</option>
                {facets?.genres.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 h-2.5 w-2.5 text-white/25" />
            </div>

            <div className="relative flex h-8 shrink-0 items-center">
              <Languages className="pointer-events-none absolute left-2.5 h-3 w-3 text-white/25" />
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                className="h-8 max-w-[10rem] cursor-pointer appearance-none rounded-full border border-white/[0.08] bg-white/[0.035] pl-7 pr-7 text-[0.66rem] font-semibold text-white/50 outline-none transition-colors hover:border-white/[0.16] hover:text-white/80"
                aria-label="Filter by language"
              >
                <option value="all">Any language</option>
                {statsData?.languages.map((value) => (
                  <option key={value.name} value={value.name}>
                    {value.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 h-2.5 w-2.5 text-white/25" />
            </div>

            <div className="relative flex h-8 shrink-0 items-center">
              <UserRound className="pointer-events-none absolute left-2.5 h-3 w-3 text-white/25" />
              <select
                value={actor}
                onChange={(event) => setActor(event.target.value)}
                className="h-8 max-w-[10rem] cursor-pointer appearance-none rounded-full border border-white/[0.08] bg-white/[0.035] pl-7 pr-7 text-[0.66rem] font-semibold text-white/50 outline-none transition-colors hover:border-white/[0.16] hover:text-white/80"
                aria-label="Filter by actor"
              >
                <option value="all">Any actor</option>
                {statsData?.people.map((value) => (
                  <option key={value.name} value={value.name}>
                    {value.name} ({value.count})
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 h-2.5 w-2.5 text-white/25" />
            </div>

            <div className="relative flex h-8 shrink-0 items-center">
              <Users className="pointer-events-none absolute left-2.5 h-3 w-3 text-white/25" />
              <select
                value={director}
                onChange={(event) => setDirector(event.target.value)}
                className="h-8 max-w-[10rem] cursor-pointer appearance-none rounded-full border border-white/[0.08] bg-white/[0.035] pl-7 pr-7 text-[0.66rem] font-semibold text-white/50 outline-none transition-colors hover:border-white/[0.16] hover:text-white/80"
                aria-label="Filter by director"
              >
                <option value="all">Any director</option>
                {statsData?.directors.map((value) => (
                  <option key={value.name} value={value.name}>
                    {value.name} ({value.count})
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 h-2.5 w-2.5 text-white/25" />
            </div>

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-8 shrink-0 items-center gap-1 px-2 text-[0.64rem] font-semibold text-white/30 transition-colors hover:text-white/70"
              >
                <FilterX className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>

          {recent.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[0.56rem] font-bold uppercase tracking-[0.16em] text-white/20">Recent</span>
              {recent.slice(0, 6).map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => runSearch(term)}
                  className="inline-flex h-7 items-center rounded-full border border-white/[0.06] bg-white/[0.025] px-2.5 text-[0.62rem] font-medium text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  {term}
                </button>
              ))}
            </div>
          )}
        </div>

        {!searchPath ? (
          <div className="space-y-10">
            <section>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="h-4 w-1 rounded-sm bg-[#e50914]" />
                  <h2 className="text-base font-bold tracking-tight text-white sm:text-lg">Popular right now</h2>
                </div>
                <Link href="/recently-added" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-neutral-400 transition hover:bg-white/5 hover:text-white">
                  Recently added
                  <ArrowRight className="h-3.5 w-3.5 text-[#e50914]" />
                </Link>
              </div>
              {popularData ? (
                <MediaGrid items={popularData.items} />
              ) : (
                <MediaGridSkeleton count={12} />
              )}
            </section>

            {recent.length > 0 && (
              <section className="panel p-5 sm:p-6">
                <p className="eyebrow">Your search history</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {recent.map((term) => (
                    <button key={term} type="button" onClick={() => runSearch(term)} className="chip !h-8">
                      <Search className="h-3 w-3" />
                      {term}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : error ? (
          <EmptyState
            icon={Search}
            title="Search is unavailable"
            description={`LocalStream could not search the library (${error}). The library index may still be building — try again in a moment.`}
            action={
              <button type="button" onClick={() => void refresh()} className="btn btn-primary">
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            }
          />
        ) : showSkeleton ? (
          <div>
            <div className="mb-6 flex items-center gap-2 text-[0.72rem] font-medium text-white/35">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              {debouncedQuery ? `Searching the library for “${debouncedQuery}”…` : 'Applying filters…'}
            </div>
            <MediaGridSkeleton count={12} />
          </div>
        ) : results.length === 0 ? (
          <EmptyState
            icon={Search}
            title={debouncedQuery ? `No results for “${debouncedQuery}”` : 'No titles match those filters'}
            description={
              activeFilterCount
                ? 'No titles match the search and filters together. Try removing a filter or using a shorter title.'
                : 'The spelling may be different in your library. Try a shorter title, the release year, an actor, or browse the full collection.'
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {activeFilterCount > 0 && (
                  <button type="button" onClick={clearFilters} className="btn btn-primary">
                    <FilterX className="h-4 w-4" />
                    Clear filters
                  </button>
                )}
                <Link href="/movies" className="btn btn-ghost">
                  Browse movies
                </Link>
                <Link href="/series" className="btn btn-ghost">
                  Browse series
                </Link>
              </div>
            }
          />
        ) : (
          <div>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[0.72rem] font-medium text-white/35">
                <span className="font-bold text-white/75">{data?.total ?? results.length}</span> result
                {(data?.total ?? results.length) === 1 ? '' : 's'}
                {debouncedQuery ? <> for “{debouncedQuery}”</> : ' for your filters'}
                {data ? <span className="text-white/20"> · {data.tookMs} ms</span> : null}
              </p>
              {didYouMean ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery(didYouMean);
                    runSearch(didYouMean);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/[0.07] px-3 py-1.5 text-[0.66rem] font-semibold text-amber-200/80 transition-colors hover:bg-amber-400/[0.12] hover:text-amber-100"
                >
                  <Sparkles className="h-3 w-3" />
                  Did you mean {didYouMean}?
                </button>
              ) : null}
            </div>

            {top ? <SpotlightResult item={top} /> : null}

            {rest.length > 0 ? (
              <>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="h-4 w-1 rounded-sm bg-[#e50914]" />
                    <h2 className="text-base font-bold tracking-tight text-white sm:text-lg">More matches</h2>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                    Ranked by relevance
                  </span>
                </div>
                <MediaGrid items={rest} />
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
