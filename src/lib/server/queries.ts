import { getDb, getLastScanAt, getLibraryVersion } from "./db";
import {
  mapEpisode,
  mapTitleDetail,
  mapTitleSummary,
  TITLE_COLUMNS,
  type EpisodeRow,
  type TitleRow,
} from "./rows";
import type {
  BrowseResponse,
  Episode,
  HomeData,
  HomeSection,
  TitleDetail,
  TitleSummary,
} from "@/lib/media/types";
import { getScanStatus } from "./scanner";

const LIST_SELECT = `
  SELECT ${TITLE_COLUMNS},
    (SELECT COUNT(*) FROM episodes e WHERE e.title_id = t.id) AS episode_count,
    (SELECT COUNT(DISTINCT e.season) FROM episodes e WHERE e.title_id = t.id) AS season_count
  FROM titles t
`;

function all<T>(sql: string, params: unknown[] = []) {
  return getDb().prepare(sql).all(...params) as T[];
}

function one<T>(sql: string, params: unknown[] = []) {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function getTitleById(id: string): TitleSummary | null {
  const row = one<TitleRow>(`${LIST_SELECT} WHERE t.id = ?`, [id]);
  return row ? mapTitleSummary(row) : null;
}

export function getTitlesByIds(ids: string[]): TitleSummary[] {
  if (!ids.length) return [];
  const unique = [...new Set(ids)].slice(0, 100);
  const placeholders = unique.map(() => "?").join(",");
  const rows = all<TitleRow>(`${LIST_SELECT} WHERE t.id IN (${placeholders})`, unique);
  const map = new Map(rows.map((row) => [row.id, mapTitleSummary(row)]));
  return unique.map((id) => map.get(id)).filter((item): item is TitleSummary => Boolean(item));
}

export function getTitleDetail(id: string): TitleDetail | null {
  const row = one<TitleRow>(`${LIST_SELECT} WHERE t.id = ?`, [id]);
  if (!row) return null;
  const episodes = all<EpisodeRow>(
    "SELECT * FROM episodes WHERE title_id = ? ORDER BY season ASC, episode ASC, path ASC",
    [id],
  );
  return mapTitleDetail(row, episodes);
}

export function getEpisode(episodeId: string): (Episode & { title: TitleSummary }) | null {
  const row = one<EpisodeRow>("SELECT * FROM episodes WHERE id = ?", [episodeId]);
  if (!row) return null;
  const title = getTitleById(row.title_id);
  if (!title) return null;
  return { ...mapEpisode(row), title };
}

export function getLatestEpisodes(limit = 12): (Episode & { seriesTitle: string })[] {
  const rows = all<EpisodeRow & { series_title: string }>(
    `SELECT e.*, t.title AS series_title FROM episodes e
     JOIN titles t ON t.id = e.title_id
     ORDER BY e.added_at DESC, e.season DESC, e.episode DESC LIMIT ?`,
    [limit],
  );
  return rows.map((row) => ({ ...mapEpisode(row), seriesTitle: row.series_title }));
}

export function getStats() {
  const row = one<{ titles: number; movies: number; series: number; total_size: number }>(
    "SELECT COUNT(*) AS titles, SUM(kind='movie') AS movies, SUM(kind='series') AS series, COALESCE(SUM(total_size), 0) AS total_size FROM titles",
  ) ?? { titles: 0, movies: 0, series: 0, total_size: 0 };
  const episodes = one<{ count: number }>("SELECT COUNT(*) AS count FROM episodes")?.count ?? 0;
  return {
    titles: row.titles,
    movies: row.movies ?? 0,
    series: row.series ?? 0,
    episodes,
    totalSize: row.total_size ?? 0,
    lastScanAt: getLastScanAt(),
  };
}

export function getCollections(limit = 12): { name: string; count: number }[] {
  return all<{ name: string; count: number }>(
    `SELECT category AS name, COUNT(*) AS count FROM titles
     WHERE category IS NOT NULL GROUP BY category ORDER BY count DESC LIMIT ?`,
    [limit],
  );
}

export function getLanguages(limit = 20): { name: string; count: number }[] {
  return all<{ name: string; count: number }>(
    `SELECT language AS name, COUNT(*) AS count FROM titles
     WHERE language IS NOT NULL GROUP BY language ORDER BY count DESC LIMIT ?`,
    [limit],
  );
}

interface PeopleCache {
  version: number;
  people: { name: string; count: number }[];
  directors: { name: string; count: number }[];
}
let peopleCache: PeopleCache | null = null;

/** Cast and directors are cached per library version; metadata refreshes bump it. */
export function getPeople(limit = 80): { people: PeopleCache["people"]; directors: PeopleCache["directors"] } {
  const version = getLibraryVersion();
  if (!peopleCache || peopleCache.version !== version) {
    const rows = all<{ cast_json: string; directors: string }>(
      "SELECT cast_json, directors FROM titles WHERE cast_json != '[]' OR directors != '[]'",
    );
    const castCounts = new Map<string, number>();
    const directorCounts = new Map<string, number>();
    for (const row of rows) {
      let cast: { name?: string }[] = [];
      let directors: string[] = [];
      try {
        const parsed = JSON.parse(row.cast_json) as unknown;
        if (Array.isArray(parsed)) cast = parsed as { name?: string }[];
      } catch {
        cast = [];
      }
      try {
        const parsed = JSON.parse(row.directors) as unknown;
        if (Array.isArray(parsed)) directors = parsed.filter((value): value is string => typeof value === "string");
      } catch {
        directors = [];
      }
      const seen = new Set<string>();
      for (const person of cast) {
        const name = person?.name?.trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        castCounts.set(name, (castCounts.get(name) ?? 0) + 1);
      }
      for (const name of directors) {
        if (!name) continue;
        directorCounts.set(name, (directorCounts.get(name) ?? 0) + 1);
      }
    }
    const sorted = (counts: Map<string, number>) =>
      [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
    peopleCache = { version, people: sorted(castCounts), directors: sorted(directorCounts) };
  }
  return {
    people: peopleCache.people.slice(0, limit),
    directors: peopleCache.directors.slice(0, limit),
  };
}

interface FacetCache {
  version: number;
  movies: BrowseResponse["facets"];
  series: BrowseResponse["facets"];
}
let facetCache: FacetCache | null = null;

export function getFacets(kind: "movie" | "series" | "all" = "all"): BrowseResponse["facets"] {
  const version = getLibraryVersion();
  if (!facetCache || facetCache.version !== version) {
    facetCache = {
      version,
      movies: buildFacets("movie"),
      series: buildFacets("series"),
    };
  }
  if (kind === "movie") return facetCache.movies;
  if (kind === "series") return facetCache.series;
  const years = [...new Set([...facetCache.movies.years, ...facetCache.series.years])].sort((a, b) => b - a);
  const genres = [...new Set([...facetCache.movies.genres, ...facetCache.series.genres])].sort();
  const categories = [...new Set([...facetCache.movies.categories, ...facetCache.series.categories])].sort();
  return { years, genres, categories };
}

function buildFacets(kind: "movie" | "series") {
  const years = all<{ year: number }>(
    "SELECT DISTINCT year FROM titles WHERE kind = ? AND year IS NOT NULL ORDER BY year DESC",
    [kind],
  ).map((row) => row.year);
  const categories = all<{ category: string }>(
    "SELECT DISTINCT category FROM titles WHERE kind = ? AND category IS NOT NULL ORDER BY category",
    [kind],
  ).map((row) => row.category);
  const genreRows = all<{ genres: string }>("SELECT genres FROM titles WHERE kind = ? AND genres != '[]'", [kind]);
  const counts = new Map<string, number>();
  for (const row of genreRows) {
    try {
      const genres = JSON.parse(row.genres) as string[];
      for (const genre of genres) counts.set(genre, (counts.get(genre) ?? 0) + 1);
    } catch {
      // Ignore malformed cached metadata.
    }
  }
  return {
    years,
    categories,
    genres: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name),
  };
}

function normalizeSqlLike(value: string) {
  return value.toLowerCase().replace(/[%_]/g, "");
}

export interface BrowseParams {
  kind?: "movie" | "series" | "all";
  page?: number;
  pageSize?: number;
  query?: string;
  genre?: string;
  year?: number | null;
  decade?: number | null;
  category?: string | null;
  language?: string | null;
  minRating?: number | null;
  sort?: "recent" | "title" | "year" | "rating" | "popular" | "size";
}

export function getBrowse(params: BrowseParams = {}): BrowseResponse {
  const db = getDb();
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize ?? 48)));
  const where: string[] = [];
  const values: unknown[] = [];

  if (params.kind && params.kind !== "all") {
    where.push("t.kind = ?");
    values.push(params.kind);
  }
  if (params.query?.trim()) {
    where.push("t.normalized_title LIKE ?");
    values.push(`%${normalizeSqlLike(params.query.trim())}%`);
  }
  if (params.genre) {
    where.push("t.genres LIKE ?");
    values.push(`%"${params.genre}"%`);
  }
  if (params.year) {
    where.push("t.year = ?");
    values.push(params.year);
  }
  if (params.decade) {
    where.push("t.year >= ? AND t.year <= ?");
    values.push(params.decade, params.decade + 9);
  }
  if (params.category) {
    where.push("t.category = ?");
    values.push(params.category);
  }
  if (params.language) {
    where.push("t.language = ?");
    values.push(params.language);
  }
  if (params.minRating) {
    where.push("t.rating >= ?");
    values.push(params.minRating);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const sort = params.sort ?? "recent";
  const orderSql =
    sort === "title"
      ? "t.title COLLATE NOCASE ASC"
      : sort === "year"
        ? "t.year DESC NULLS LAST, t.title COLLATE NOCASE ASC"
        : sort === "rating"
          ? "t.rating DESC NULLS LAST, t.vote_count DESC NULLS LAST, t.added_at DESC"
          : sort === "popular"
            ? "COALESCE(t.rating, 0) DESC, t.popularity DESC, t.total_size DESC, t.added_at DESC"
            : sort === "size"
              ? "t.total_size DESC"
              : "t.added_at DESC, t.id ASC";

  const total = one<{ count: number }>(`SELECT COUNT(*) AS count FROM titles t ${whereSql}`, values)?.count ?? 0;
  const rows = all<TitleRow>(
    `${LIST_SELECT} ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
    [...values, pageSize, (page - 1) * pageSize],
  );

  return {
    items: rows.map(mapTitleSummary),
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
    facets: getFacets(params.kind ?? "all"),
  };
}

function section(key: string, title: string, eyebrow: string, href: string, items: TitleSummary[]): HomeSection | null {
  if (!items.length) return null;
  return { key, title, eyebrow, href, items, layout: "poster" };
}

function queryTitles(where: string, order: string, limit: number, params: unknown[] = []): TitleSummary[] {
  const rows = all<TitleRow>(`${LIST_SELECT} ${where ? `WHERE ${where}` : ""} ORDER BY ${order} LIMIT ?`, [
    ...params,
    limit,
  ]);
  return rows.map(mapTitleSummary);
}

function seededShuffle<T>(items: T[], seedText: string): T[] {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    seed ^= seedText.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  const random = () => {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface HomeCache {
  version: number;
  data: HomeData;
  createdAt: number;
}
let homeCache: HomeCache | null = null;

export function getHomeData(): HomeData {
  const version = getLibraryVersion();
  if (homeCache && homeCache.version === version && Date.now() - homeCache.createdAt < 20_000) {
    return { ...homeCache.data, scan: getScanStatus(), stats: { ...homeCache.data.stats, lastScanAt: getLastScanAt() } };
  }

  const heroCandidates = queryTitles(
    "t.kind = 'movie' AND t.year >= 2000 AND t.category != '3D Movies'",
    "COALESCE(t.rating, 0) DESC, t.total_size DESC, t.added_at DESC",
    18,
  );
  const hero = seededShuffle(heroCandidates, new Date().toISOString().slice(0, 10)).slice(0, 6);

  const recentlyAdded = queryTitles("", "t.added_at DESC", 20);
  const popular = queryTitles(
    "",
    "COALESCE(t.rating, 0) DESC, t.popularity DESC, t.total_size DESC, t.added_at DESC",
    20,
  );
  const recentMovies = queryTitles("t.kind = 'movie' AND t.year >= 2019", "t.year DESC, t.added_at DESC, t.total_size DESC", 20);
  const recentSeries = queryTitles("t.kind = 'series'", "t.added_at DESC", 12);
  const archive = queryTitles("t.kind = 'movie' AND t.year < 2005", "COALESCE(t.rating, 0) DESC, t.total_size DESC, t.year DESC", 20);
  const foreign = queryTitles("t.kind = 'movie' AND t.language IS NOT NULL AND t.language != 'English'", "t.added_at DESC", 20);

  const stats = getStats();
  const sections = [
    section("recent", "Recently added", "Fresh on the server", "/recently-added", recentlyAdded),
    section("popular", "Popular in your library", "Most watched picks", "/movies?sort=popular", popular),
    section("latest-movies", "Latest movies", "New releases on disk", "/movies?sort=year", recentMovies),
    section("series", "TV series", "Episodic storytelling", "/series", recentSeries),
    section("archive", "From the archive", "Timeless cinema", "/movies?sort=rating", archive),
    section("foreign", "World cinema", "Beyond English", "/genres", foreign),
  ].filter((entry): entry is HomeSection => Boolean(entry));

  const data: HomeData = {
    hero,
    sections,
    stats,
    scan: getScanStatus(),
    collections: getCollections(),
    genres: getFacets("movie").genres.slice(0, 12),
  };
  homeCache = { version, data, createdAt: Date.now() };
  return data;
}

export function getRecommendations(seedIds: string[], limit = 20): TitleSummary[] {
  const db = getDb();
  if (!seedIds.length) {
    return queryTitles("", "COALESCE(t.rating,0) DESC, t.added_at DESC", limit);
  }
  const seeds = getTitlesByIds(seedIds.slice(0, 12));
  if (!seeds.length) return [];
  const categories = [...new Set(seeds.map((seed) => seed.category).filter(Boolean))] as string[];
  const genres = [...new Set(seeds.flatMap((seed) => seed.genres))];
  const kinds = [...new Set(seeds.map((seed) => seed.kind))];
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (categories.length) {
    clauses.push(`t.category IN (${categories.map(() => "?").join(",")})`);
    values.push(...categories);
  }
  if (genres.length) {
    for (const genre of genres.slice(0, 4)) {
      clauses.push("t.genres LIKE ?");
      values.push(`%"${genre}"%`);
    }
  }
  if (!clauses.length) {
    return queryTitles(
      `t.kind IN (${kinds.map(() => "?").join(",")})`,
      "COALESCE(t.rating,0) DESC, t.added_at DESC",
      limit,
      kinds,
    );
  }
  const exclude = seeds.map(() => "?").join(",");
  const rows = all<TitleRow>(
    `${LIST_SELECT} WHERE (${clauses.join(" OR ")}) AND t.id NOT IN (${exclude})
     ORDER BY COALESCE(t.rating,0) DESC, t.popularity DESC, t.added_at DESC LIMIT ?`,
    [...values, ...seeds.map((seed) => seed.id), limit],
  );
  return rows.map(mapTitleSummary);
}

export function getRelatedTitles(title: TitleDetail, limit = 16): TitleSummary[] {
  const genres = title.genres.slice(0, 3);
  const clauses = ["t.id != ?"];
  const values: unknown[] = [title.id];
  if (title.category) {
    clauses.push("t.category = ?");
    values.push(title.category);
  }
  if (genres.length) {
    const genreClauses = genres.map(() => "t.genres LIKE ?");
    clauses.push(`(${genreClauses.join(" OR ")})`);
    values.push(...genres.map((genre) => `%"${genre}"%`));
  }
  clauses.push("t.kind = ?");
  values.push(title.kind);
  const rows = all<TitleRow>(
    `${LIST_SELECT} WHERE ${clauses.join(" AND ")}
     ORDER BY COALESCE(t.rating,0) DESC, ABS(COALESCE(t.year, 0) - ?) ASC, t.added_at DESC LIMIT ?`,
    [...values, title.year ?? 0, limit],
  );
  return rows.map(mapTitleSummary);
}

export function getHeroPool(limit = 6): TitleSummary[] {
  return queryTitles(
    "t.kind = 'movie' AND t.year >= 2000 AND t.category != '3D Movies'",
    "COALESCE(t.rating,0) DESC, t.total_size DESC",
    limit,
  );
}

export function searchEpisodesForTitle(titleId: string): Episode[] {
  const rows = all<EpisodeRow>("SELECT * FROM episodes WHERE title_id = ? ORDER BY season, episode", [titleId]);
  return rows.map(mapEpisode);
}

export interface SearchCorpusEntry {
  item: TitleSummary;
  normalizedTitle: string;
  altTitles: string[];
  cast: string[];
  directors: string[];
}

/**
 * Full, lightweight projection used to build the in-memory fuzzy index.
 * Called once per library version and cached by the search module.
 */
export function getSearchCorpus(): SearchCorpusEntry[] {
  const rows = all<TitleRow>(`${LIST_SELECT} ORDER BY t.added_at DESC`);
  return rows.map((row) => {
    let altTitles: string[] = [];
    let cast: string[] = [];
    let directors: string[] = [];
    try {
      const parsed = JSON.parse(row.alt_titles) as unknown;
      if (Array.isArray(parsed)) altTitles = parsed.filter((value): value is string => typeof value === "string");
    } catch {
      altTitles = [];
    }
    try {
      const parsed = JSON.parse(row.cast_json) as unknown;
      if (Array.isArray(parsed)) {
        cast = parsed
          .map((person) => (person && typeof person === "object" ? (person as { name?: unknown }).name : null))
          .filter((name): name is string => typeof name === "string" && name.trim().length > 0);
      }
    } catch {
      cast = [];
    }
    try {
      const parsed = JSON.parse(row.directors) as unknown;
      if (Array.isArray(parsed)) directors = parsed.filter((value): value is string => typeof value === "string");
    } catch {
      directors = [];
    }
    return {
      item: mapTitleSummary(row),
      normalizedTitle: row.normalized_title,
      altTitles,
      cast,
      directors,
    };
  });
}

export function countTitles() {
  return one<{ count: number }>("SELECT COUNT(*) AS count FROM titles")?.count ?? 0;
}
