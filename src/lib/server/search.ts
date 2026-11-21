import Fuse from "fuse.js";
import { getLibraryVersion } from "./db";
import { getSearchCorpus, type SearchCorpusEntry } from "./queries";
import { normalizeTitle, titleSimilarity, foldText } from "@/lib/media/normalize";
import type { SearchHit, SearchResponse, TitleSummary } from "@/lib/media/types";

/**
 * Fuzzy in-memory search over the local catalogue.
 *
 * The index is rebuilt only when the library version changes (after a scan or
 * metadata refresh), so browsing and typing stay fast even with ~20k titles.
 */

interface SearchDoc {
  id: string;
  title: string;
  normalized: string;
  altTitles: string[];
  altNormalized: string[];
  yearLabel: string;
  category: string;
  genres: string[];
  cast: string[];
  directors: string[];
  peopleNormalized: string[];
  item: TitleSummary;
}

interface SearchIndex {
  version: number;
  docs: SearchDoc[];
  byId: Map<string, SearchDoc>;
  fuse: Fuse<SearchDoc>;
}

let cache: SearchIndex | null = null;

function toDoc(entry: SearchCorpusEntry): SearchDoc {
  return {
    id: entry.item.id,
    title: entry.item.title,
    normalized: entry.normalizedTitle,
    altTitles: entry.altTitles,
    altNormalized: entry.altTitles.map((title) => normalizeTitle(title)),
    yearLabel: entry.item.year ? String(entry.item.year) : "",
    category: entry.item.category ?? "",
    genres: entry.item.genres,
    cast: entry.cast,
    directors: entry.directors,
    peopleNormalized: [...entry.cast, ...entry.directors].map((name) => normalizeTitle(name)),
    item: entry.item,
  };
}

function buildIndex(): SearchIndex {
  const docs = getSearchCorpus().map(toDoc);
  const fuse = new Fuse(docs, {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.4,
    minMatchCharLength: 2,
    keys: [
      { name: "title", weight: 0.62 },
      { name: "altTitles", weight: 0.14 },
      { name: "cast", weight: 0.08 },
      { name: "directors", weight: 0.05 },
      { name: "category", weight: 0.04 },
      { name: "genres", weight: 0.05 },
      { name: "yearLabel", weight: 0.02 },
    ],
  });
  return {
    version: getLibraryVersion(),
    docs,
    byId: new Map(docs.map((doc) => [doc.id, doc])),
    fuse,
  };
}

function getIndex() {
  const version = getLibraryVersion();
  if (!cache || cache.version !== version) cache = buildIndex();
  return cache;
}

export interface SearchOptions {
  query: string;
  limit?: number;
  kind?: "movie" | "series" | "all";
  genre?: string | null;
  year?: number | null;
  language?: string | null;
  category?: string | null;
  actor?: string | null;
  director?: string | null;
}

function normalizeQuery(value: string) {
  return foldText(value)
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function personMatches(query: string, names: string[]) {
  const normalized = query.toLowerCase();
  return names.some((name) => name.toLowerCase() === normalized || name.toLowerCase().includes(normalized));
}

function matchScore(doc: SearchDoc, rawQuery: string, query: string) {
  let best = titleSimilarity(query, doc.title);
  for (const alt of doc.altTitles) {
    const score = titleSimilarity(query, alt);
    if (score > best) best = score;
  }

  const compactQuery = query.replace(/\s+/g, "");
  if (doc.normalized === query || doc.altNormalized.includes(query)) return 1;
  if (doc.normalized.replace(/\s+/g, "") === compactQuery) return Math.max(best, 0.985);

  // Prefix / containment evidence that Fuse may under-rate.
  if (doc.normalized.startsWith(query)) best = Math.max(best, 0.93);
  else if (doc.normalized.includes(query)) best = Math.max(best, 0.79);
  else if (query.includes(doc.normalized) && doc.normalized.length >= 4) best = Math.max(best, 0.74);

  // Searching by an actor or director should surface their films.
  if (query.length >= 3) {
    for (const person of doc.peopleNormalized) {
      const similarity = titleSimilarity(query, person);
      if (similarity > 0.82) {
        best = Math.max(best, 0.66 + similarity * 0.19);
        break;
      }
      if (person.length >= 5 && (person.startsWith(query) || person.includes(query))) {
        best = Math.max(best, 0.7);
      }
    }
  }

  // Secondary matches: people/genres/category are useful for discovery.
  const category = doc.category.toLowerCase();
  const genres = doc.genres.map((genre) => genre.toLowerCase());
  if (category && query.includes(category)) best = Math.max(best, 0.58);
  for (const genre of genres) {
    if (query === genre || query.includes(genre)) best = Math.max(best, 0.52);
  }

  // A query that is just a year should return that year's titles.
  if (/^(19|20)\d{2}$/.test(rawQuery) && doc.yearLabel === rawQuery) best = Math.max(best, 0.62);

  return best;
}

function yearFromQuery(query: string) {
  const match = query.match(/\b(19[2-9]\d|20[0-3]\d)\b/);
  return match ? Number(match[1]) : null;
}

export function searchTitles(options: SearchOptions): SearchResponse {
  const started = Date.now();
  const raw = normalizeQuery(options.query);
  const limit = Math.min(80, Math.max(1, options.limit ?? 40));
  const empty: SearchResponse = {
    query: options.query,
    total: 0,
    tookMs: 0,
    results: [],
    didYouMean: null,
    suggestions: [],
  };
  if (!raw) return empty;

  const explicitYear = options.year ?? null;
  const queryYear = yearFromQuery(raw);
  const textQuery = queryYear ? raw.replace(String(queryYear), " ").replace(/\s+/g, " ").trim() : raw;
  const searchText = textQuery || raw;
  const index = getIndex();

  // A bare year such as "1917" or "2012" can be a film title as well as a release year.
  let rawHits: { item: SearchDoc; score?: number }[];
  if (textQuery) {
    rawHits = index.fuse.search(textQuery, { limit: 160 });
  } else {
    const byId = new Map<string, { item: SearchDoc; score?: number }>();
    for (const hit of index.fuse.search(raw, { limit: 40 })) byId.set(hit.item.id, hit);
    for (const doc of index.docs) {
      if (byId.size >= 200) break;
      if (doc.yearLabel === raw && !byId.has(doc.id)) byId.set(doc.id, { item: doc, score: 0.5 });
    }
    rawHits = Array.from(byId.values());
  }

  const ranked: { doc: SearchDoc; score: number }[] = [];
  for (const hit of rawHits) {
    const doc = hit.item;
    let score = matchScore(doc, raw, searchText);
    const fused = hit.score ?? 0.4;
    // Fuse's distance confirms typos the manual scorer may miss.
    score = Math.max(score, (1 - fused) * 0.9);

    if (queryYear && doc.item.year) {
      const delta = Math.abs(queryYear - doc.item.year);
      score += delta === 0 ? 0.07 : delta <= 1 ? 0.015 : -0.12;
    }
    if (explicitYear && doc.item.year === explicitYear) score += 0.06;
    if (options.kind && options.kind !== "all" && doc.item.kind !== options.kind) score -= 0.35;
    if (options.genre && !doc.item.genres.some((genre) => genre.toLowerCase() === options.genre!.toLowerCase())) score -= 0.25;
    if (options.language && doc.item.language !== options.language) score -= 0.2;
    if (options.category && doc.item.category !== options.category) score -= 0.2;
    if (options.actor) {
      score += personMatches(options.actor, doc.cast) ? 0.05 : -0.4;
    }
    if (options.director) {
      score += personMatches(options.director, doc.directors) ? 0.05 : -0.4;
    }

    if (score < 0.34) continue;
    ranked.push({ doc, score });
  }

  ranked.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 0.03) return b.score - a.score;
    const ratingDiff = (b.doc.item.rating ?? 0) - (a.doc.item.rating ?? 0);
    if (Math.abs(ratingDiff) > 0.2) return ratingDiff;
    return (b.doc.item.popularity ?? 0) - (a.doc.item.popularity ?? 0);
  });

  const seen = new Set<string>();
  const results: SearchHit[] = [];
  for (const entry of ranked) {
    if (options.kind && options.kind !== "all" && entry.doc.item.kind !== options.kind) continue;
    if (options.genre && !entry.doc.item.genres.some((genre) => genre.toLowerCase() === options.genre!.toLowerCase())) continue;
    if (options.language && entry.doc.item.language !== options.language) continue;
    if (options.category && entry.doc.item.category !== options.category) continue;
    if (options.actor && !personMatches(options.actor, entry.doc.cast)) continue;
    if (options.director && !personMatches(options.director, entry.doc.directors)) continue;
    if (explicitYear && entry.doc.item.year !== explicitYear) continue;

    const dedupeKey = `${entry.doc.normalized}|${entry.doc.item.year ?? ""}|${entry.doc.item.kind}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    results.push({
      ...entry.doc.item,
      score: Math.round(Math.min(1, entry.score) * 1000) / 1000,
      matchedTitle: entry.doc.title,
    });
    if (results.length >= limit) break;
  }

  const top = results[0];
  let didYouMean: string | null = null;
  if (top && top.score < 0.94 && top.score >= 0.5 && normalizeTitle(top.title) !== searchText) {
    didYouMean = top.title;
  }

  return {
    query: options.query,
    total: results.length,
    tookMs: Date.now() - started,
    results,
    didYouMean,
    suggestions: results.slice(0, 6),
  };
}

export function suggestTitles(query: string, limit = 7): SearchHit[] {
  return searchTitles({ query, limit }).results;
}

/** Exposed for diagnostics and the stats endpoint. */
export function searchIndexStats() {
  const index = getIndex();
  return {
    titles: index.docs.length,
    libraryVersion: index.version,
  };
}
