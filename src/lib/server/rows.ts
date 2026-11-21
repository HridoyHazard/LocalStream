import type { Episode, SubtitleTrack, TitleDetail, TitleSummary } from "@/lib/media/types";

export interface TitleRow {
  id: string;
  kind: "movie" | "series";
  title: string;
  normalized_title: string;
  alt_titles: string;
  year: number | null;
  overview: string | null;
  tagline: string | null;
  rating: number | null;
  vote_count: number | null;
  runtime: number | null;
  genres: string;
  cast_json: string;
  directors: string;
  poster_url: string | null;
  backdrop_url: string | null;
  trailer_url: string | null;
  local_poster: string | null;
  local_backdrop: string | null;
  folder_path: string;
  category: string | null;
  language: string | null;
  tmdb_id: number | null;
  imdb_id: string | null;
  metadata_status: string;
  file_path: string;
  extension: string;
  file_size: number;
  total_size: number;
  subtitles: string;
  added_at: number;
  popularity: number;
  episode_count?: number;
  season_count?: number;
}

export const TITLE_COLUMNS = `
  t.id, t.kind, t.title, t.normalized_title, t.alt_titles, t.year, t.overview, t.tagline,
  t.rating, t.vote_count, t.runtime, t.genres, t.cast_json, t.directors, t.poster_url,
  t.backdrop_url, t.trailer_url, t.local_poster, t.local_backdrop, t.folder_path, t.category,
  t.language, t.tmdb_id, t.imdb_id, t.metadata_status, t.file_path, t.extension, t.file_size,
  t.total_size, t.subtitles, t.added_at, t.popularity
`;

export function parseJsonArray<T>(value: string | null | undefined, fallback: T[] = []): T[] {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

export function safeMediaUrl(path: string | null | undefined) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (!path.trim()) return null;
  // Local folder artwork is proxied for same-origin delivery and HTTPS safety.
  return `/api/image?path=${encodeURIComponent(path)}`;
}

export function mapTitleSummary(row: TitleRow): TitleSummary {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    year: row.year,
    rating: row.rating,
    voteCount: row.vote_count,
    runtime: row.runtime,
    genres: parseJsonArray<string>(row.genres),
    overview: row.overview,
    posterUrl: row.poster_url || safeMediaUrl(row.local_poster),
    localPoster: row.local_poster,
    backdropUrl: row.backdrop_url || safeMediaUrl(row.local_backdrop),
    category: row.category,
    language: row.language,
    addedAt: row.added_at,
    totalSize: row.total_size,
    episodeCount: row.episode_count ?? 0,
    seasonCount: row.season_count ?? 0,
    popularity: row.popularity,
  };
}

export interface EpisodeRow {
  id: string;
  title_id: string;
  season: number;
  episode: number;
  name: string | null;
  path: string;
  extension: string;
  size: number;
  runtime: number | null;
  still_url: string | null;
  overview: string | null;
  subtitles: string;
  added_at: number;
}

export function mapEpisode(row: EpisodeRow): Episode {
  return {
    id: row.id,
    titleId: row.title_id,
    season: row.season,
    episode: row.episode,
    name: row.name,
    path: row.path,
    extension: row.extension,
    size: row.size,
    runtime: row.runtime,
    stillUrl: row.still_url,
    overview: row.overview,
    subtitles: parseJsonArray<SubtitleTrack>(row.subtitles),
    addedAt: row.added_at,
  };
}

export function mapTitleDetail(row: TitleRow, episodes: EpisodeRow[]): TitleDetail {
  const summary = mapTitleSummary(row);
  const mappedEpisodes = episodes.map(mapEpisode);
  const seasons = [...new Set(mappedEpisodes.map((episode) => episode.season))].sort((a, b) => a - b);
  return {
    ...summary,
    altTitles: parseJsonArray<string>(row.alt_titles),
    tagline: row.tagline,
    directors: parseJsonArray<string>(row.directors),
    cast: parseJsonArray<{ name: string; character?: string | null; profileUrl?: string | null }>(row.cast_json),
    trailerUrl: row.trailer_url,
    folderPath: row.folder_path,
    tmdbId: row.tmdb_id,
    metadataStatus: row.metadata_status,
    filePath: row.file_path,
    extension: row.extension,
    subtitles: parseJsonArray<SubtitleTrack>(row.subtitles),
    episodes: mappedEpisodes,
    seasons,
    tmdbUrl: row.tmdb_id ? `https://www.themoviedb.org/${row.kind === "series" ? "tv" : "movie"}/${row.tmdb_id}` : null,
    imdbId: row.imdb_id,
  };
}
