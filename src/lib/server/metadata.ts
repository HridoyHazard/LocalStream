import { getDb, bumpLibraryVersion } from "./db";
import { serverConfig } from "./config";
import { normalizeTitle, titleSimilarity } from "@/lib/media/normalize";

/**
 * Optional TMDB enrichment.
 *
 * Everything in LocalStream works without this module: the scanner stores
 * local folder artwork and the UI generates cinematic fallback posters. When
 * TMDB_API_KEY is configured, titles are matched conservatively (title +
 * year) and the best metadata is stored in SQLite.
 */

const TMDB_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";
const REQUEST_TIMEOUT = 12_000;
const MIN_CONFIDENCE = 0.72;

interface TmdbSearchResult {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genre_ids?: number[];
}

interface TmdbSearchResponse {
  results?: TmdbSearchResult[];
}

interface TmdbPerson {
  id: number;
  name: string;
  character?: string;
  job?: string;
  profile_path?: string | null;
  order?: number;
}

interface TmdbVideo {
  key: string;
  site: string;
  type: string;
  official?: boolean;
}

interface TmdbDetails {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  tagline?: string;
  release_date?: string;
  first_air_date?: string;
  runtime?: number;
  episode_run_time?: number[];
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genres?: { id: number; name: string }[];
  credits?: { cast?: TmdbPerson[]; crew?: TmdbPerson[]; created_by?: TmdbPerson[] };
  videos?: { results?: TmdbVideo[] };
  external_ids?: { imdb_id?: string | null };
  alternative_titles?: { titles?: { title: string }[]; results?: { title: string }[] };
  created_by?: TmdbPerson[];
  homepage?: string;
}

interface TitleRow {
  id: string;
  kind: "movie" | "series";
  title: string;
  year: number | null;
  folder_path: string;
}

interface EnrichmentResult {
  processed: number;
  matched: number;
  failed: number;
  skipped: number;
}

function apiKey() {
  return serverConfig.tmdbApiKey;
}

export function metadataEnabled() {
  return Boolean(apiKey());
}

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const key = apiKey();
  if (!key) throw new Error("TMDB_API_KEY is not configured");

  const url = new URL(`${TMDB_BASE}${path}`);
  for (const [name, value] of Object.entries(params)) {
    if (value) url.searchParams.set(name, value);
  }
  url.searchParams.set("language", serverConfig.tmdbLanguage);
  url.searchParams.set("include_adult", "false");

  const headers: Record<string, string> = { Accept: "application/json" };
  // v4 read access tokens are JWTs; classic v3 keys go in the query string.
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  else url.searchParams.set("api_key", key);

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT), cache: "no-store" });
  if (response.status === 401) throw new Error("TMDB rejected the API key (401)");
  if (response.status === 429) throw new Error("TMDB rate limit reached (429)");
  if (!response.ok) throw new Error(`TMDB returned HTTP ${response.status}`);
  return (await response.json()) as T;
}

function yearOf(value: string | undefined | null) {
  if (!value) return null;
  const match = value.match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

function imageUrl(path: string | null | undefined, size: string) {
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}

function titleScore(query: string, year: number | null, candidate: TmdbSearchResult) {
  const names = [candidate.title, candidate.name, candidate.original_title, candidate.original_name].filter(
    (value): value is string => Boolean(value),
  );
  const queryNormalized = normalizeTitle(query);
  let best = 0;
  for (const name of names) {
    const score = titleSimilarity(query, name);
    if (score > best) best = score;
  }

  const candidateYear = yearOf(candidate.release_date) ?? yearOf(candidate.first_air_date);
  let yearBonus = 0;
  if (year && candidateYear) {
    const delta = Math.abs(year - candidateYear);
    yearBonus = delta === 0 ? 0.12 : delta === 1 ? 0.03 : -0.14;
  }

  // Very short titles ("It", "Up") are dangerous to fuzzy match without a year.
  const shortAmbiguous = queryNormalized.length <= 3 && (!year || !candidateYear || year !== candidateYear);
  if (shortAmbiguous && normalizeTitle(names[0] ?? "") !== queryNormalized) return 0;

  const popularity = Math.min(0.04, Math.max(0, candidate.popularity ?? 0) / 2500);
  return best + yearBonus + popularity;
}

function pickTrailer(details: TmdbDetails) {
  const videos = details.videos?.results ?? [];
  const preferred =
    videos.find((video) => video.site === "YouTube" && video.type === "Trailer" && video.official) ??
    videos.find((video) => video.site === "YouTube" && video.type === "Trailer") ??
    videos.find((video) => video.site === "YouTube" && video.type === "Teaser");
  return preferred ? `https://www.youtube.com/watch?v=${preferred.key}` : null;
}

function alternativeTitles(details: TmdbDetails) {
  const raw = details.alternative_titles?.titles ?? details.alternative_titles?.results ?? [];
  const names = raw.map((entry) => entry.title).filter(Boolean);
  const main = details.title ?? details.name;
  const original = details.original_title ?? details.original_name;
  if (original && original !== main) names.unshift(original);
  return [...new Set(names)].slice(0, 12);
}

function toGenres(details: TmdbDetails) {
  return (details.genres ?? []).map((genre) => genre.name).filter(Boolean);
}

function toCast(details: TmdbDetails) {
  return (details.credits?.cast ?? [])
    .slice(0, 24)
    .map((person) => ({
      name: person.name,
      character: person.character ?? null,
      profileUrl: imageUrl(person.profile_path, "w185"),
    }));
}

function toDirectors(details: TmdbDetails) {
  const crew = details.credits?.crew ?? [];
  const directors = crew.filter((person) => person.job === "Director").map((person) => person.name);
  const creators = (details.created_by ?? details.credits?.created_by ?? []).map((person) => person.name);
  return [...new Set([...directors, ...creators])].slice(0, 6);
}

async function searchCandidate(kind: "movie" | "series", title: string, year: number | null) {
  const endpoint = kind === "movie" ? "/search/movie" : "/search/tv";
  const params: Record<string, string> = { query: title };
  if (year) {
    if (kind === "movie") params.year = String(year);
    else params.first_air_date_year = String(year);
  }
  let response: TmdbSearchResponse;
  try {
    response = await tmdbFetch<TmdbSearchResponse>(endpoint, params);
  } catch (error) {
    // A strict year filter can wrongly hide the right title when the local
    // release year differs by one; retry without it.
    if (!year) throw error;
    response = await tmdbFetch<TmdbSearchResponse>(endpoint, { query: title });
  }

  const results = (response.results ?? []).slice(0, 20);
  if (!results.length) return null;
  let best: { result: TmdbSearchResult; score: number } | null = null;
  for (const result of results) {
    const score = titleScore(title, year, result);
    if (!best || score > best.score) best = { result, score };
  }
  if (!best) return null;
  return best.score >= MIN_CONFIDENCE ? best : null;
}

/**
 * Match and enrich one title. Exported so an admin action can refresh a
 * single entry without rescanning the server.
 */
export async function enrichTitleById(id: string): Promise<"matched" | "unmatched" | "disabled"> {
  if (!metadataEnabled()) return "disabled";
  const row = getDb()
    .prepare("SELECT id, kind, title, year, folder_path FROM titles WHERE id = ?")
    .get(id) as TitleRow | undefined;
  if (!row) throw new Error("Title not found");
  const matched = await enrichRow(row);
  if (matched !== null) bumpLibraryVersion();
  return matched ? "matched" : "unmatched";
}

async function enrichRow(row: TitleRow): Promise<boolean | null> {
  const db = getDb();
  const mark = (status: string) => {
    db.prepare("UPDATE titles SET metadata_status = ?, metadata_updated_at = ? WHERE id = ?").run(
      status,
      Date.now(),
      row.id,
    );
  };

  try {
    const candidate = await searchCandidate(row.kind, row.title, row.year);
    if (!candidate) {
      mark("unmatched");
      return false;
    }

    const tmdbKind = row.kind === "movie" ? "movie" : "tv";
    const details = await tmdbFetch<TmdbDetails>(`/${tmdbKind}/${candidate.result.id}`, {
      append_to_response: "credits,videos,external_ids,alternative_titles",
    });

    const displayTitle = (row.kind === "movie" ? details.title : details.name) ?? row.title;
    const year =
      yearOf(details.release_date) ?? yearOf(details.first_air_date) ?? row.year ?? null;
    const runtime =
      row.kind === "movie" ? details.runtime ?? null : details.episode_run_time?.[0] ?? null;
    const altTitles = alternativeTitles(details);
    const genres = toGenres(details);
    const cast = toCast(details);
    const directors = toDirectors(details);
    const poster = imageUrl(details.poster_path ?? candidate.result.poster_path, "w780");
    const backdrop = imageUrl(details.backdrop_path ?? candidate.result.backdrop_path, "w1280");

    db.prepare(
      `UPDATE titles SET
        title = @title,
        normalized_title = @normalized,
        alt_titles = @alt_titles,
        year = @year,
        overview = @overview,
        tagline = @tagline,
        rating = @rating,
        vote_count = @vote_count,
        runtime = @runtime,
        genres = @genres,
        cast_json = @cast,
        directors = @directors,
        poster_url = @poster,
        backdrop_url = @backdrop,
        trailer_url = @trailer,
        tmdb_id = @tmdb_id,
        tmdb_kind = @tmdb_kind,
        imdb_id = @imdb_id,
        popularity = @popularity,
        metadata_status = 'matched',
        metadata_updated_at = @now,
        updated_at = @now
      WHERE id = @id`,
    ).run({
      id: row.id,
      title: displayTitle,
      normalized: normalizeTitle(displayTitle),
      alt_titles: JSON.stringify(altTitles),
      year,
      overview: details.overview ?? null,
      tagline: details.tagline ?? null,
      rating: details.vote_average ?? candidate.result.vote_average ?? null,
      vote_count: details.vote_count ?? candidate.result.vote_count ?? null,
      runtime,
      genres: JSON.stringify(genres),
      cast: JSON.stringify(cast),
      directors: JSON.stringify(directors),
      poster: poster ?? null,
      backdrop: backdrop ?? null,
      trailer: pickTrailer(details),
      tmdb_id: details.id,
      tmdb_kind: tmdbKind,
      imdb_id: details.external_ids?.imdb_id ?? null,
      popularity: details.popularity ?? candidate.result.popularity ?? 0,
      now: Date.now(),
    });
    return true;
  } catch (error) {
    console.warn(`[localstream] metadata failed for ${row.title}:`, error instanceof Error ? error.message : error);
    mark("error");
    return null;
  }
}

let running: Promise<EnrichmentResult> | null = null;

/**
 * Enrich a batch of titles that have never been matched. Runs sequentially
 * to stay well inside TMDB's rate limits.
 */
export function enrichPendingTitles(limit = 40): Promise<EnrichmentResult> {
  if (!metadataEnabled()) {
    return Promise.resolve({ processed: 0, matched: 0, failed: 0, skipped: 0 });
  }
  if (running) return running;

  running = (async () => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT id, kind, title, year, folder_path FROM titles
         WHERE metadata_status IN ('none', 'error', 'unmatched')
           AND (metadata_updated_at IS NULL OR metadata_updated_at < ?)
         ORDER BY added_at DESC LIMIT ?`,
      )
      .all(Date.now() - 30 * 24 * 60 * 60 * 1000, Math.max(1, Math.min(500, limit))) as TitleRow[];

    const result: EnrichmentResult = { processed: 0, matched: 0, failed: 0, skipped: 0 };
    if (!rows.length) return result;

    let changed = false;
    // Priority titles first; small pause keeps the API happy.
    for (let index = 0; index < rows.length; index++) {
      const outcome = await enrichRow(rows[index]);
      result.processed += 1;
      if (outcome === true) {
        result.matched += 1;
        changed = true;
      } else if (outcome === false) {
        result.skipped += 1;
      } else {
        result.failed += 1;
      }
      if (index < rows.length - 1) await new Promise((resolve) => setTimeout(resolve, 120));
    }

    if (changed) bumpLibraryVersion();
    return result;
  })().finally(() => {
    running = null;
  });

  return running;
}

export function metadataStatus() {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(metadata_status = 'matched') AS matched,
        SUM(metadata_status = 'unmatched') AS unmatched,
        SUM(metadata_status = 'error') AS errors
       FROM titles`,
    )
    .get() as { total: number; matched: number | null; unmatched: number | null; errors: number | null };
  return {
    enabled: metadataEnabled(),
    total: row.total,
    matched: row.matched ?? 0,
    unmatched: row.unmatched ?? 0,
    errors: row.errors ?? 0,
  };
}
