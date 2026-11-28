import type { TitleSummary } from '@/lib/media/types';

type TitleLike = Pick<TitleSummary, 'id'> | string;

export function pad(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '00';
  return value.toString().padStart(2, '0');
}

export function detailsHref(title: TitleLike) {
  const id = typeof title === 'string' ? title : title.id;
  return `/details/${encodeURIComponent(id)}`;
}

export function watchHref(
  title: TitleLike,
  options: { episode?: string | null; restart?: boolean } = {},
) {
  const id = typeof title === 'string' ? title : title.id;
  const params = new URLSearchParams();
  if (options.episode) params.set('episode', options.episode);
  if (options.restart) params.set('restart', '1');
  const query = params.toString();
  return `/watch/${encodeURIComponent(id)}${query ? `?${query}` : ''}`;
}

export function streamUrl(path: string) {
  const encoded = path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `/api/stream/${encoded}`;
}

export function subtitleUrl(path: string) {
  return `/api/subtitles?path=${encodeURIComponent(path)}`;
}

export function vlcUrl(params: {
  titleId?: string;
  episodeId?: string;
  path?: string;
  download?: boolean;
  scope?: 'season' | 'series';
  season?: number;
  direct?: boolean;
}) {
  const search = new URLSearchParams();
  if (params.scope) search.set('scope', params.scope);
  if (params.scope === 'season' && typeof params.season === 'number') search.set('season', String(params.season));
  if (params.direct) search.set('direct', '1');
  if (params.titleId) search.set('titleId', params.titleId);
  if (params.episodeId) search.set('episodeId', params.episodeId);
  if (params.path) search.set('path', params.path);
  if (params.download) search.set('download', '1');
  return `/api/vlc?${search.toString()}`;
}

export function episodeCode(season?: number | null, episode?: number | null) {
  if (typeof season !== 'number' && typeof episode !== 'number') return '';
  return `S${pad(season ?? 1)} · E${pad(episode ?? 1)}`;
}

/**
 * The catalog does not store a resolution field. Use one when the folder or
 * filename carries it; otherwise fall back to a neutral badge that is always
 * truthful for the local library.
 */
export function qualityLabel(
  title: Pick<TitleSummary, 'title' | 'category' | 'kind'> & { totalSize?: number | null; quality?: string | null },
) {
  if (title.quality) return title.quality;
  const haystack = `${title.title} ${title.category ?? ''}`;
  const match = haystack.match(/\b(2160p|1080p|720p|480p|4k|uhd)\b/i);
  if (match) {
    const value = match[1].toLowerCase();
    if (value === '2160p' || value === '4k' || value === 'uhd') return '4K';
    return value;
  }
  if (title.kind === 'series') return 'Series';
  if ((title.totalSize ?? 0) >= 30 * 1024 * 1024 * 1024) return '4K';
  if ((title.totalSize ?? 0) >= 4 * 1024 * 1024 * 1024) return '1080p';
  return 'HD';
}

export function relativeTime(timestamp: number) {
  const diffMinutes = Math.floor((Date.now() - timestamp) / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function metaLine(
  title: Pick<TitleSummary, 'year' | 'kind' | 'rating'> & {
    episodeCount?: number;
    seasonCount?: number;
    runtime?: number | null;
  },
) {
  const parts: string[] = [];
  if (title.year) parts.push(String(title.year));
  if (title.kind === 'series') {
    if (title.seasonCount) parts.push(`${title.seasonCount} season${title.seasonCount === 1 ? '' : 's'}`);
    else if (title.episodeCount) parts.push(`${title.episodeCount} episodes`);
    else parts.push('Series');
  } else if (title.runtime) {
    parts.push(`${title.runtime} min`);
  } else {
    parts.push('Film');
  }
  return parts.join(' · ');
}

export function titleFromPath(path: string) {
  const filename = path.split('/').pop() || 'Untitled';
  return (
    decodeURIComponent(filename)
      .replace(/\.[^/.]+$/, '')
      .replace(/[._]/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\bS(\d{1,2})E(\d{1,2})\b/i, '')
      .replace(/\s+/g, ' ')
      .trim() || 'Untitled'
  );
}

export function extensionFromPath(path: string) {
  return (path.split('.').pop() || 'mp4').toLowerCase();
}

export function formatBytes(bytes: number | null | undefined) {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function formatRuntime(minutes: number | null | undefined) {
  if (!minutes || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}
