'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowDown,
  CalendarDays,
  ChevronDown,
  Film,
  FilterX,
  Languages,
  Layers,
  LoaderCircle,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tv,
  X,
} from 'lucide-react';
import type { BrowseResponse, StatsResponse, TitleSummary } from '@/lib/media/types';
import { apiGet } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { getContinueWatching, getProgressRatio, subscribeToProgress } from '@/lib/watch-progress';
import PageHeader from '@/components/ui/PageHeader';
import MediaGrid from '@/components/media/MediaGrid';
import { MediaGridSkeleton } from '@/components/media/Skeletons';
import EmptyState from '@/components/ui/EmptyState';
import { cn, formatCount } from '@/lib/utils';

interface BrowseViewProps {
  kind: 'movie' | 'series';
  eyebrow: string;
  title: string;
  description: string;
}

const SORTS = [
  { value: 'recent', label: 'Recently added' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'popular', label: 'Most popular' },
  { value: 'year', label: 'Newest release' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'size', label: 'Largest file' },
] as const;

type SortValue = (typeof SORTS)[number]['value'];

interface FilterState {
  query: string;
  decade: string;
  genre: string;
  category: string;
  language: string;
  sort: SortValue;
}

function decadeOf(year: number) {
  return Math.floor(year / 10) * 10;
}

function filtersFromParams(params: URLSearchParams): FilterState {
  const sort = params.get('sort');
  return {
    query: params.get('q') ?? '',
    decade: params.get('decade') ?? 'all',
    genre: params.get('genre') ?? 'all',
    category: params.get('category') ?? 'all',
    language: params.get('language') ?? 'all',
    sort: (SORTS.some((option) => option.value === sort) ? sort : 'recent') as SortValue,
  };
}

export default function BrowseView({ kind, eyebrow, title, description }: BrowseViewProps) {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<FilterState>(() => filtersFromParams(searchParams));
  // The query string this component last wrote itself; anything else is an outside navigation.
  const lastWritten = useRef(searchParams.toString());
  const [debouncedQuery, setDebouncedQuery] = useState(filters.query);
  const [items, setItems] = useState<TitleSummary[]>([]);
  const [facets, setFacets] = useState<BrowseResponse['facets']>({ years: [], genres: [], categories: [] });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveSection, setLiveSection] = useState<BrowseResponse['section']>(undefined);
  const [liveOffline, setLiveOffline] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [progressMap, setProgressMap] = useState<Map<string, number>>(new Map());
  const sequence = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data: statsData } = useApi<StatsResponse>('/api/stats');
  const stats = statsData?.stats;
  const scan = statsData?.scan;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(filters.query), 260);
    return () => window.clearTimeout(timer);
  }, [filters.query]);

  useEffect(() => {
    const read = () => {
      const map = new Map<string, number>();
      for (const record of getContinueWatching()) {
        const ratio = getProgressRatio(record);
        if (ratio > 0) map.set(record.titleId, ratio);
      }
      setProgressMap(map);
    };
    read();
    return subscribeToProgress(read);
  }, []);

  useEffect(() => {
    const onRefresh = () => setReloadKey((value) => value + 1);
    window.addEventListener('localstream:refresh', onRefresh);
    return () => window.removeEventListener('localstream:refresh', onRefresh);
  }, []);

  const baseQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set('kind', kind);
    params.set('pageSize', '48');
    params.set('sort', filters.sort);
    if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim());
    if (filters.decade !== 'all') params.set('decade', filters.decade);
    if (filters.genre !== 'all') params.set('genre', filters.genre);
    if (filters.category !== 'all') params.set('category', filters.category);
    if (filters.language !== 'all') params.set('language', filters.language);
    return params.toString();
  }, [debouncedQuery, filters.category, filters.decade, filters.genre, filters.language, filters.sort, kind]);

  // Keep the address bar shareable without triggering a Next.js navigation
  // (which would remount the grid and lose the current scroll position).
  useEffect(() => {
    const params = new URLSearchParams(baseQuery);
    params.delete('kind');
    params.delete('pageSize');
    params.delete('page');
    if (params.get('sort') === 'recent') params.delete('sort');
    const query = params.toString();
    lastWritten.current = query;
    const next = `${window.location.pathname}${query ? `?${query}` : ''}`;
    window.history.replaceState(null, '', next);
  }, [baseQuery]);

  // Menu links such as /movies?genre=Action keep this component mounted, so the
  // filters must follow the address bar when something else changes it.
  const urlQuery = searchParams.toString();
  useEffect(() => {
    if (urlQuery === lastWritten.current) return;
    lastWritten.current = urlQuery;
    const next = filtersFromParams(new URLSearchParams(urlQuery));
    setFilters(next);
    setDebouncedQuery(next.query);
  }, [urlQuery]);

  useEffect(() => {
    const controller = new AbortController();
    const id = ++sequence.current;
    setInitialLoading(true);
    setError(null);
    setItems([]);
    setPage(1);
    setHasMore(false);
    setLoadMoreFailed(false);
    setLoadingMore(false);
    setLiveSection(undefined);
    setLiveOffline(false);

    apiGet<BrowseResponse>(`/api/titles?${baseQuery}&page=1`, controller.signal, { force: reloadKey > 0 })
      .then((response) => {
        if (sequence.current !== id) return;
        setItems(response.items);
        setFacets(response.facets);
        setTotal(response.total);
        setPage(response.page);
        setHasMore(response.hasMore);
        setLiveSection(response.section);
        setLiveOffline(Boolean(response.offline));
      })
      .catch((cause) => {
        if (sequence.current !== id || (cause instanceof DOMException && cause.name === 'AbortError')) return;
        setError(cause instanceof Error ? cause.message : 'Could not load the collection');
      })
      .finally(() => {
        if (sequence.current === id) setInitialLoading(false);
      });

    return () => controller.abort();
  }, [baseQuery, reloadKey]);

  const loadMore = useCallback(async () => {
    if (loadingMore || initialLoading || !hasMore || loadMoreFailed) return;
    const id = sequence.current;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const response = await apiGet<BrowseResponse>(`/api/titles?${baseQuery}&page=${next}`);
      // Filters changed while this page was loading: its items belong to the old list.
      if (sequence.current !== id) return;
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...response.items.filter((item) => !seen.has(item.id))];
      });
      setPage(response.page);
      setHasMore(response.hasMore);
      setTotal(response.total);
    } catch {
      if (sequence.current === id) setLoadMoreFailed(true);
    } finally {
      if (sequence.current === id) setLoadingMore(false);
    }
  }, [baseQuery, hasMore, initialLoading, loadMoreFailed, loadingMore, page]);

  useEffect(() => {
    const element = sentinelRef.current;
    if (!element || !hasMore || initialLoading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, initialLoading, loadMore]);

  const setFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const activeFilterCount = [
    debouncedQuery.trim().length > 0,
    filters.decade !== 'all',
    filters.genre !== 'all',
    filters.category !== 'all',
    filters.language !== 'all',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setFilters({ query: '', decade: 'all', genre: 'all', category: 'all', language: 'all', sort: 'recent' });
    setDebouncedQuery('');
  };

  const decades = useMemo(() => {
    const values = new Set<number>();
    for (const year of facets.years) values.add(decadeOf(year));
    return [...values].sort((a, b) => b - a);
  }, [facets.years]);

  const languages = statsData?.languages ?? [];
  const liveSections = (statsData?.live?.sections ?? []).filter(
    (section) => section.count > 0 && section.kind === kind,
  );
  const totalForKind = kind === 'movie' ? stats?.movies : stats?.series;

  return (
    <div>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        statValue={totalForKind ? totalForKind.toLocaleString() : '—'}
        statLabel={kind === 'movie' ? 'Films available' : 'Series available'}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip !h-8">
            <Layers className="h-3 w-3" />
            {statsData?.stats.titles.toLocaleString() ?? '—'} titles
          </span>
          <span className="chip !h-8">
            <Sparkles className="h-3 w-3 text-accent-300" />
            {stats?.episodes.toLocaleString() ?? '—'} episodes indexed
          </span>
          {scan?.running ? (
            <span className="chip !h-8 border-accent/25 bg-accent/[0.07] text-accent-200">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Scanning {scan.scannedDirs.toLocaleString()} folders
            </span>
          ) : null}
        </div>
      </PageHeader>

      <div className="container-page py-8 sm:py-10">
        <div className="sticky top-[calc(var(--header-height)-1px)] z-30 -mx-[var(--page-x)] mb-8 border-y border-white/[0.06] bg-[#0d0d0e]/90 px-[var(--page-x)] py-3 backdrop-blur-xl">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative min-w-0 flex-1 lg:max-w-md">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
                <input
                  type="search"
                  value={filters.query}
                  onChange={(event) => setFilter('query', event.target.value)}
                  placeholder={`Search ${kind === 'movie' ? 'films' : 'series'} by title, year, cast…`}
                  className="h-10 w-full rounded-full border border-white/[0.09] bg-white/[0.04] pl-9 pr-9 text-[0.76rem] font-medium text-white outline-none transition-colors placeholder:text-white/25 focus:border-white/20 focus:bg-white/[0.06]"
                  aria-label={`Search ${kind === 'movie' ? 'movies' : 'series'}`}
                />
                {filters.query ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFilter('query', '');
                      setDebouncedQuery('');
                    }}
                    className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/[0.08] text-white/40 transition-colors hover:bg-white/[0.14] hover:text-white"
                    aria-label="Clear search"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex h-9 items-center">
                  <SlidersHorizontal className="pointer-events-none absolute left-2.5 h-3 w-3 text-white/30" />
                  <select
                    value={filters.sort}
                    onChange={(event) => setFilter('sort', event.target.value as SortValue)}
                    className="h-9 cursor-pointer appearance-none rounded-full border border-white/[0.08] bg-white/[0.04] pl-7 pr-8 text-[0.68rem] font-semibold text-white/60 outline-none transition-colors hover:border-white/[0.16] hover:text-white/85 focus:border-white/25"
                    aria-label="Sort collection"
                  >
                    {SORTS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 h-3 w-3 text-white/30" />
                </div>

                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 text-[0.66rem] font-semibold text-white/40 transition-colors hover:border-white/20 hover:text-white"
                  >
                    <FilterX className="h-3 w-3" />
                    Clear {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
                  </button>
                )}
              </div>
            </div>

            <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-0.5">
              <button
                type="button"
                onClick={() => setFilter('decade', 'all')}
                className={cn('chip !h-7 shrink-0 text-[0.66rem]', filters.decade === 'all' && 'chip-active')}
              >
                All years
              </button>
              {decades.map((decade) => (
                <button
                  key={decade}
                  type="button"
                  onClick={() => setFilter('decade', String(decade))}
                  className={cn(
                    'chip !h-7 shrink-0 text-[0.66rem]',
                    filters.decade === String(decade) && 'chip-active',
                  )}
                >
                  {decade}s
                </button>
              ))}

              <span className="mx-1 h-4 w-px shrink-0 bg-white/[0.08]" />

              <div className="relative flex h-7 shrink-0 items-center">
                <CalendarDays className="pointer-events-none absolute left-2.5 h-3 w-3 text-white/25" />
                <select
                  value={filters.genre}
                  onChange={(event) => setFilter('genre', event.target.value)}
                  className="h-7 cursor-pointer appearance-none rounded-full border border-white/[0.08] bg-white/[0.035] pl-7 pr-7 text-[0.64rem] font-semibold text-white/50 outline-none transition-colors hover:border-white/[0.16] hover:text-white/80"
                  aria-label="Filter by genre"
                >
                  <option value="all">All genres</option>
                  {facets.genres.map((genre) => (
                    <option key={genre} value={genre}>
                      {genre}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 h-2.5 w-2.5 text-white/25" />
              </div>

              <div className="relative flex h-7 shrink-0 items-center">
                <Layers className="pointer-events-none absolute left-2.5 h-3 w-3 text-white/25" />
                <select
                  value={filters.category}
                  onChange={(event) => setFilter('category', event.target.value)}
                  className="h-7 max-w-[12rem] cursor-pointer appearance-none rounded-full border border-white/[0.08] bg-white/[0.035] pl-7 pr-7 text-[0.64rem] font-semibold text-white/50 outline-none transition-colors hover:border-white/[0.16] hover:text-white/80"
                  aria-label="Filter by collection"
                >
                  <option value="all">All collections</option>
                  {facets.categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 h-2.5 w-2.5 text-white/25" />
              </div>

              <div className="relative flex h-7 shrink-0 items-center">
                <Languages className="pointer-events-none absolute left-2.5 h-3 w-3 text-white/25" />
                <select
                  value={filters.language}
                  onChange={(event) => setFilter('language', event.target.value)}
                  className="h-7 max-w-[11rem] cursor-pointer appearance-none rounded-full border border-white/[0.08] bg-white/[0.035] pl-7 pr-7 text-[0.64rem] font-semibold text-white/50 outline-none transition-colors hover:border-white/[0.16] hover:text-white/80"
                  aria-label="Filter by language"
                >
                  <option value="all">All languages</option>
                  {languages.map((language) => (
                    <option key={language.name} value={language.name}>
                      {language.name} ({language.count})
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 h-2.5 w-2.5 text-white/25" />
              </div>
            </div>
          </div>
        </div>

        {scan?.running && (
          <div className="demo-banner mb-6 flex flex-col gap-3 rounded-2xl px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-accent-300" />
              <p className="text-[0.72rem] font-medium text-white/55">
                Indexing your library in the background — {scan.scannedDirs.toLocaleString()} folders and{' '}
                {scan.discoveredFiles.toLocaleString()} videos found so far. New titles appear automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event('localstream:refresh'))}
              className="inline-flex shrink-0 items-center gap-1.5 text-[0.68rem] font-semibold text-accent-300 transition-colors hover:text-accent-200"
            >
              Refresh
            </button>
          </div>
        )}

        {liveSection && liveOffline ? (
          <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300/80" />
              <p className="text-[0.72rem] leading-relaxed text-amber-100/70">
                <span className="font-semibold text-amber-200/90">{liveSection.label}</span> is served by a media
                server that is offline right now. You can browse the cached catalogue, but streaming resumes when the
                server is reachable again.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
              className="inline-flex shrink-0 items-center gap-1.5 text-[0.68rem] font-semibold text-amber-200 transition-colors hover:text-amber-100"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          </div>
        ) : null}

        {!liveSection && statsData?.server?.reachable === false ? (
          <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300/80" />
              <p className="text-[0.72rem] leading-relaxed text-amber-100/70">
                <span className="font-semibold text-amber-200/90">Your primary media server is offline.</span>{' '}
                LocalStream cannot reach{' '}
                <span className="font-medium text-amber-100/80">{statsData.server.url}</span>
                {statsData.server.reachability?.error ? (
                  <span className="text-amber-100/50"> ({statsData.server.reachability.error})</span>
                ) : null}
                . The indexed catalogue stays browsable, but playback and new scans resume when the server is
                reachable again.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setReloadKey((value) => value + 1);
                window.dispatchEvent(new Event('localstream:refresh'));
              }}
              className="inline-flex shrink-0 items-center gap-1.5 text-[0.68rem] font-semibold text-amber-200 transition-colors hover:text-amber-100"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          </div>
        ) : null}

        {liveSections.length ? (
          <div className="mb-6 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[0.58rem] font-bold uppercase tracking-[0.16em] text-white/25">
              Streaming servers
            </span>
            {liveSections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setFilter('category', filters.category === section.label ? 'all' : section.label)}
                className={cn(
                  'chip !h-7 text-[0.66rem]',
                  filters.category === section.label && 'chip-active',
                )}
                title={`${section.count.toLocaleString()} titles on ${section.server}`}
              >
                {section.label}
                <span className="text-[0.58rem] opacity-50">{section.count.toLocaleString()}</span>
              </button>
            ))}
          </div>
        ) : null}

        {error ? (
          <EmptyState
            icon={Film}
            title="The collection could not be loaded"
            description={`LocalStream could not read the library index (${error}). Check that the app is running and retry.`}
            action={
              <button
                type="button"
                onClick={() => setReloadKey((value) => value + 1)}
                className="btn btn-primary"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            }
          />
        ) : initialLoading ? (
          <MediaGridSkeleton count={12} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={activeFilterCount ? FilterX : kind === 'movie' ? Film : Tv}
            title={
              activeFilterCount
                ? 'No titles match those filters'
                : liveOffline
                  ? 'This server is offline'
                  : liveSection
                    ? 'Catalogue is loading'
                    : kind === 'movie'
                      ? 'No films indexed yet'
                      : 'No series indexed yet'
            }
            description={
              activeFilterCount
                ? 'Try a different search term, year or genre, or clear the filters to see the whole collection.'
                : liveOffline
                  ? `${liveSection?.label ?? 'This collection'} is served by an extra media server that cannot be reached right now. Reconnect to the ISP network and retry.`
                  : liveSection
                    ? `${liveSection.label} is being catalogued from its server. This usually finishes within a few seconds — retry in a moment.`
                    : scan?.running
                      ? 'The first scan is still running. Titles will appear here as soon as they are indexed.'
                      : 'Run a library scan to bring movies and series from your media server into LocalStream.'
            }
            action={
              activeFilterCount ? (
                <button type="button" onClick={clearFilters} className="btn btn-primary">
                  <FilterX className="h-4 w-4" />
                  Clear all filters
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setReloadKey((value) => value + 1)}
                  className="btn btn-ghost"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </button>
              )
            }
          />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[0.68rem] font-medium tracking-wide text-white/30">
                {activeFilterCount
                  ? `${formatCount(total, 'title')} found`
                  : `${formatCount(total, 'title')} on your server`}
              </p>
              <span className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-white/20">
                {kind === 'movie' ? 'Film collection' : 'Episodic collection'}
              </span>
            </div>

            <MediaGrid items={items} progressFor={(item) => progressMap.get(item.id)} />

            <div ref={sentinelRef} className="h-px" aria-hidden="true" />

            <div className="mt-10 flex flex-col items-center gap-3">
              {loadingMore ? (
                <span className="inline-flex items-center gap-2 text-[0.72rem] font-semibold text-white/40">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Loading more titles…
                </span>
              ) : loadMoreFailed ? (
                <button
                  type="button"
                  onClick={() => setLoadMoreFailed(false)}
                  className="btn btn-ghost btn-sm"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Could not load more. Retry
                </button>
              ) : hasMore ? (
                <button type="button" onClick={() => void loadMore()} className="btn btn-ghost btn-sm">
                  <ArrowDown className="h-3.5 w-3.5" />
                  Load more
                </button>
              ) : (
                <p className="text-[0.62rem] font-medium uppercase tracking-[0.16em] text-white/20">
                  {items.length.toLocaleString()} of {total.toLocaleString()} titles shown
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
