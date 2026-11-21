import {
  Bookmark,
  CalendarClock,
  Clapperboard,
  Clock3,
  Film,
  FolderHeart,
  House,
  Layers,
  Sparkles,
  Tv,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { StatsResponse } from '@/lib/media/types';

export interface NavGroupItem {
  label: string;
  href: string;
  hint?: string;
  icon: LucideIcon;
}

export interface NavGroup {
  name: string;
  items: NavGroupItem[];
}

function count(value?: number) {
  return typeof value === 'number' && value > 0 ? value.toLocaleString() : undefined;
}

/** Category groups shared by the desktop mega menu and the mobile sheet. */
export function buildNavGroups(stats?: StatsResponse | null): NavGroup[] {
  const movieCategories = (stats?.facets.movies.categories ?? []).slice(0, 4);
  const seriesCategories = (stats?.facets.series.categories ?? []).slice(0, 4);
  const genres = (stats?.facets.all.genres ?? []).slice(0, 5);
  const totals = stats?.stats;

  const movieItems: NavGroupItem[] = [
    { label: 'All movies', href: '/movies', hint: count(totals?.movies), icon: Film },
    ...movieCategories.map((category) => ({
      label: category,
      href: `/movies?category=${encodeURIComponent(category)}`,
      icon: Clapperboard,
    })),
    { label: 'Recently added', href: '/recently-added', icon: CalendarClock },
  ];

  const seriesItems: NavGroupItem[] = [
    { label: 'All TV shows', href: '/series', hint: count(totals?.series), icon: Tv },
    ...seriesCategories.map((category) => ({
      label: category,
      href: `/series?category=${encodeURIComponent(category)}`,
      icon: Clapperboard,
    })),
    { label: 'Series by genre', href: '/genres', icon: Sparkles },
  ];

  const genreItems: NavGroupItem[] = genres.length
    ? genres.map((genre) => ({
        label: genre,
        href: `/movies?genre=${encodeURIComponent(genre)}`,
        icon: Sparkles,
      }))
    : [{ label: 'Browse collections', href: '/genres', icon: Layers }];

  return [
    {
      name: 'Browse',
      items: [
        { label: 'Home', href: '/', icon: House },
        { label: 'Movies', href: '/movies', hint: count(totals?.movies), icon: Film },
        { label: 'TV Shows', href: '/series', hint: count(totals?.series), icon: Tv },
        { label: 'Recently added', href: '/recently-added', icon: CalendarClock },
        { label: 'Genres & collections', href: '/genres', icon: Layers },
      ],
    },
    { name: 'Movies', items: movieItems },
    { name: 'Series & TV', items: seriesItems },
    {
      name: 'Discover',
      items: [
        ...genreItems,
        { label: 'My list', href: '/watchlist', icon: Bookmark },
        { label: 'Watch history', href: '/history', icon: FolderHeart },
        { label: 'All titles', href: '/search', icon: Clock3 },
      ],
    },
  ];
}
