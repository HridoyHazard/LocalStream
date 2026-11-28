import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  BrowseResponse,
  Episode,
  HomeSection,
  MediaKind,
  SearchHit,
  SubtitleTrack,
  TitleDetail,
  TitleSummary,
} from "@/lib/media/types";
import { fetchDirectoryListing, parseDirectoryIndexDate, type ListingItem } from "./listing";
import { mountPath, serverConfig, type MediaMount } from "./config";
import { EXTRA_SECTIONS, sectionForPath, type MediaSection } from "./sources";
import { isMountReachable, peekMountReachable } from "./reachability";
import {
  basename,
  dirname,
  extractYear,
  isImageFile,
  isSeasonFolder,
  isSubtitleFile,
  isVideoFile,
  normalizeTitle,
  parseEpisode,
  parseMediaName,
  seasonNumberFromFolder,
} from "@/lib/media/normalize";

/**
 * Live catalogue for the extra ISP servers.
 *
 * The primary server is indexed into SQLite by the scanner. The other servers
 * are far too large to walk completely, so this module borrows the DhakaFLIX
 * approach: crawl only the curated section folders (year/alphabet buckets),
 * cache the resulting title folders, and resolve a title's files only when the
 * user opens it. A full warm crawl is ~200 directory requests, not 35k.
 *
 * Live ids never collide with database ids:
 *   lv_<base64url(folder path)>
 *   le_<base64url(file path)>
 */

export const LIVE_TITLE_PREFIX = "lv_";
export const LIVE_EPISODE_PREFIX = "le_";

const CATALOG_TTL_MS = 30 * 60_000;
const DETAIL_TTL_MS = 3 * 60_000;
const WARM_INTERVAL_MS = 5 * 60_000;
const CATALOG_CONCURRENCY = 8;
const SECTION_CONCURRENCY = 3;
const REQUEST_TIMEOUT_MS = 10_000;
const LISTING_TIMEOUT_MS = 6_000;
const BROWSE_WAIT_MS = 5_000;
const CATALOG_DIR = path.join(process.cwd(), "data", "live-catalog");

interface CatalogItem {
  id: string;
  folderPath: string;
  sectionId: string;
  title: string;
  rawName: string;
  year: number | null;
  quality: string | null;
  kind: MediaKind;
  language: string | null;
  addedAt: number;
}

interface SectionCatalog {
  sectionId: string;
  savedAt: number;
  items: CatalogItem[];
}

const stateKey = "__localstream_live_catalog__";
type LiveState = {
  catalogs: Map<string, SectionCatalog>;
  crawling: Map<string, Promise<SectionCatalog | null>>;
  lastWarmAt: number;
  norms: Map<string, { title: string; raw: string; tokens: string[] }>;
  details: Map<string, { value: TitleDetail; savedAt: number }>;
};

const globalStore = globalThis as typeof globalThis & { [stateKey]?: LiveState };
const state: LiveState =
  globalStore[stateKey] ??
  (globalStore[stateKey] = {
    catalogs: new Map(),
    crawling: new Map(),
    lastWarmAt: 0,
    norms: new Map(),
    details: new Map(),
  });

function encodeLive(prefix: string, value: string) {
  return `${prefix}${Buffer.from(value, "utf8").toString("base64url")}`;
}

function decodeLive(prefix: string, id: string): string | null {
  if (!id.startsWith(prefix)) return null;
  try {
    const decoded = Buffer.from(id.slice(prefix.length), "base64url").toString("utf8");
    return decoded || null;
  } catch {
    return null;
  }
}

export function isLiveTitleId(id: string | null | undefined): boolean {
  return Boolean(id && id.startsWith(LIVE_TITLE_PREFIX));
}

export function isLiveEpisodeId(id: string | null | undefined): boolean {
  return Boolean(id && id.startsWith(LIVE_EPISODE_PREFIX));
}

export function liveTitleId(folderPath: string) {
  return encodeLive(LIVE_TITLE_PREFIX, folderPath);
}

function liveEpisodeId(filePath: string) {
  return encodeLive(LIVE_EPISODE_PREFIX, filePath);
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (!items.length) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise
      .then((value) => resolve(value))
      .catch(() => resolve(fallback))
      .finally(() => clearTimeout(timer));
  });
}

async function listDirectory(listingPath: string): Promise<ListingItem[]> {
  try {
    const listing = await fetchDirectoryListing(listingPath, AbortSignal.timeout(REQUEST_TIMEOUT_MS));
    return listing.items;
  } catch {
    return [];
  }
}

function qualityFromName(name: string): string | null {
  if (/\b(?:2160p|4k|uhd)\b/i.test(name)) return "4K";
  if (/\b3d\b/i.test(name)) return "3D";
  if (/\b1080p\b/i.test(name)) return "1080p";
  if (/\b720p\b/i.test(name)) return "720p";
  if (/\b480p\b/i.test(name)) return "480p";
  return null;
}

/** Folder names mark TV releases with "(TV Series 2015– )"; drop that tag. */
function cleanLiveTitle(value: string, fallback: string) {
  const cleaned = value
    .replace(/\s*[\(\[]\s*(?:TV\s+)?(?:Mini\s+)?Series[^\)\]]*[\)\]]?/gi, " ")
    .replace(/\(\s*\)|\[\s*\]/g, " ")
    .replace(/[\s._-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

function mountForSection(section: MediaSection): MediaMount | null {
  return serverConfig.mounts.find((mount) => mount.id === section.mount) ?? null;
}

function sectionMountLabel(section: MediaSection) {
  return mountForSection(section)?.label ?? `Server ${section.mount}`;
}

function catalogFile(sectionId: string) {
  return path.join(CATALOG_DIR, `${sectionId}.json`);
}

function readCatalogFromDisk(sectionId: string): SectionCatalog | null {
  try {
    const parsed = JSON.parse(readFileSync(catalogFile(sectionId), "utf8")) as Partial<SectionCatalog>;
    if (!parsed || parsed.sectionId !== sectionId || !Array.isArray(parsed.items)) return null;
    const items = parsed.items.filter(
      (item): item is CatalogItem =>
        Boolean(item) && typeof item.id === "string" && typeof item.folderPath === "string" && typeof item.title === "string",
    );
    return { sectionId, savedAt: Number(parsed.savedAt) || 0, items };
  } catch {
    return null;
  }
}

function writeCatalogToDisk(catalog: SectionCatalog) {
  try {
    mkdirSync(CATALOG_DIR, { recursive: true });
    const target = catalogFile(catalog.sectionId);
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(temp, JSON.stringify(catalog));
    renameSync(temp, target);
  } catch {
    // A cache write failure must never break browsing.
  }
}

/** Load persisted catalogs so search and rails are useful immediately after a restart. */
function hydrateFromDisk() {
  for (const section of EXTRA_SECTIONS) {
    if (state.catalogs.has(section.id)) continue;
    const cached = readCatalogFromDisk(section.id);
    if (cached) state.catalogs.set(section.id, cached);
  }
}

function toCatalogItem(section: MediaSection, folder: ListingItem): CatalogItem {
  const rawName = folder.name;
  const parsed = parseMediaName(rawName);
  const title = cleanLiveTitle(parsed.title || rawName, rawName);
  return {
    id: liveTitleId(folder.path),
    folderPath: folder.path,
    sectionId: section.id,
    title,
    rawName,
    year: parsed.year ?? extractYear(rawName),
    quality: qualityFromName(rawName),
    kind: section.kind ?? "movie",
    language: section.language ?? null,
    addedAt: parseDirectoryIndexDate(folder.mtime) || 0,
  };
}

async function crawlSection(section: MediaSection, mount: MediaMount): Promise<CatalogItem[]> {
  if (!(await isMountReachable(mount))) return [];

  const rootPath = mountPath(mount, section.dir);
  const rootItems = await listDirectory(rootPath);
  let folders = rootItems.filter((item) => item.isDir);

  if (section.isContainer) {
    const bucketLists = await mapPool(folders, CATALOG_CONCURRENCY, (bucket) => listDirectory(bucket.path));
    folders = bucketLists.flat().filter((item) => item.isDir);
  }

  const seen = new Set<string>();
  const items: CatalogItem[] = [];
  for (const folder of folders) {
    if (!folder.isDir || seen.has(folder.path)) continue;
    if (isSeasonFolder(folder.name) || /^specials?$/i.test(folder.name)) continue;
    if (/^_h5ai|^@eaDir|^\./i.test(folder.name)) continue;
    seen.add(folder.path);
    items.push(toCatalogItem(section, folder));
  }
  return items;
}

function refreshSection(section: MediaSection): Promise<SectionCatalog | null> {
  const existing = state.crawling.get(section.id);
  if (existing) return existing;

  const task = (async (): Promise<SectionCatalog | null> => {
    try {
      const mount = mountForSection(section);
      if (!mount) return state.catalogs.get(section.id) ?? null;
      const items = await crawlSection(section, mount);
      if (!items.length) {
        // Keep the previous catalog if the server hiccupped or is offline.
        return state.catalogs.get(section.id) ?? readCatalogFromDisk(section.id);
      }
      const catalog: SectionCatalog = { sectionId: section.id, savedAt: Date.now(), items };
      state.catalogs.set(section.id, catalog);
      writeCatalogToDisk(catalog);
      return catalog;
    } catch {
      return state.catalogs.get(section.id) ?? null;
    } finally {
      state.crawling.delete(section.id);
    }
  })();

  state.crawling.set(section.id, task);
  return task;
}

function getSectionCatalog(section: MediaSection): SectionCatalog | null {
  const cached = state.catalogs.get(section.id) ?? readCatalogFromDisk(section.id);
  if (cached) state.catalogs.set(section.id, cached);
  return cached;
}

async function getFreshSectionCatalog(
  section: MediaSection,
  options: { wait?: boolean; maxAge?: number } = {},
): Promise<SectionCatalog | null> {
  const maxAge = options.maxAge ?? CATALOG_TTL_MS;
  const cached = getSectionCatalog(section);
  if (cached && Date.now() - cached.savedAt < maxAge) return cached;

  const task = refreshSection(section);
  if (cached) {
    // Stale-while-revalidate: serve the previous crawl while refreshing.
    void task.catch(() => null);
    return cached;
  }
  if (options.wait) return withTimeout(task, BROWSE_WAIT_MS, null);
  void task.catch(() => null);
  return null;
}

/**
 * Warm every live section. Called at server start and (cheaply) from hot API
 * routes. Only the first call in each window does work; the returned promise
 * can be ignored.
 */
export async function ensureLiveCatalogs(options: { force?: boolean } = {}): Promise<void> {
  const now = Date.now();
  if (!options.force && state.lastWarmAt && now - state.lastWarmAt < WARM_INTERVAL_MS) return;
  state.lastWarmAt = now;

  hydrateFromDisk();

  await mapPool(EXTRA_SECTIONS, SECTION_CONCURRENCY, async (section) => {
    const cached = state.catalogs.get(section.id);
    if (cached && now - cached.savedAt < CATALOG_TTL_MS) return;
    await refreshSection(section);
  });
}

export function liveSectionForCategory(category: string | null | undefined): MediaSection | null {
  const needle = category?.trim().toLowerCase();
  if (!needle) return null;
  return (
    EXTRA_SECTIONS.find(
      (section) => section.id.toLowerCase() === needle || section.label.toLowerCase() === needle,
    ) ?? null
  );
}

function proxiedImage(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  return `/api/image?path=${encodeURIComponent(imagePath)}`;
}

function itemToSummary(item: CatalogItem, section: MediaSection): TitleSummary {
  const posterPath = `${item.folderPath}/a_AL_.jpg`;
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    year: item.year,
    rating: null,
    voteCount: null,
    runtime: null,
    genres: [],
    overview: null,
    posterUrl: proxiedImage(posterPath),
    localPoster: posterPath,
    backdropUrl: null,
    category: section.label,
    language: item.language,
    addedAt: item.addedAt,
    totalSize: 0,
    episodeCount: item.kind === "series" ? undefined : 0,
    seasonCount: item.kind === "series" ? undefined : 0,
    popularity: 0,
    quality: item.quality,
  };
}

function sortItems(items: CatalogItem[], sort: LiveSort): CatalogItem[] {
  const copy = [...items];
  switch (sort) {
    case "title":
      copy.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
      break;
    case "year":
      copy.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title));
      break;
    case "size":
    case "popular":
    case "rating":
    case "recent":
    default:
      copy.sort((a, b) => b.addedAt - a.addedAt || a.title.localeCompare(b.title));
  }
  return copy;
}

export type LiveSort = "recent" | "title" | "year" | "rating" | "popular" | "size";

export interface LiveBrowseParams {
  category: string;
  kind?: MediaKind | "all";
  page?: number;
  pageSize?: number;
  query?: string | null;
  year?: number | null;
  decade?: number | null;
  language?: string | null;
  sort?: LiveSort;
}

export interface LiveBrowseResult {
  items: TitleSummary[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  facets: BrowseResponse["facets"];
  section: { id: string; label: string; kind: MediaKind; count: number };
  /** True when the section's server is known to be unreachable. */
  offline: boolean;
}

export async function browseLiveSection(params: LiveBrowseParams): Promise<LiveBrowseResult | null> {
  const section = liveSectionForCategory(params.category);
  if (!section) return null;
  const sectionKind = section.kind ?? "movie";

  const catalog = await getFreshSectionCatalog(section, { wait: true });
  const all = catalog?.items ?? [];
  const mount = mountForSection(section);
  let offline = false;
  if (mount) {
    const known = peekMountReachable(mount);
    // The very first visit after boot may not have probed this server yet.
    // Wait briefly so the grid can explain an offline server immediately
    // instead of showing cached posters that will all fail a moment later.
    offline =
      known === null
        ? !(await withTimeout(isMountReachable(mount), 1_500, true))
        : known === false;
  }

  let filtered: CatalogItem[] = all;
  if (params.kind && params.kind !== "all" && params.kind !== sectionKind) filtered = [];

  const query = params.query?.trim();
  if (query) {
    const normalized = normalizeTitle(query);
    const yearQuery = /^(?:19|20)\d{2}$/.test(query) ? Number(query) : null;
    if (normalized) {
      filtered = filtered.filter((item) => {
        if (yearQuery && item.year === yearQuery) return true;
        const titleNorm = normalizeTitle(item.title);
        const rawNorm = normalizeTitle(item.rawName);
        return titleNorm.includes(normalized) || rawNorm.includes(normalized);
      });
    }
  }
  if (params.year) filtered = filtered.filter((item) => item.year === params.year);
  if (params.decade) {
    const start = params.decade;
    filtered = filtered.filter((item) => item.year !== null && item.year >= start && item.year <= start + 9);
  }
  if (params.language) {
    const language = params.language.toLowerCase();
    filtered = filtered.filter((item) => (item.language ?? "").toLowerCase() === language);
  }

  const sorted = sortItems(filtered, params.sort ?? "recent");
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize ?? 48)));
  const pageItems = sorted.slice((page - 1) * pageSize, page * pageSize).map((item) => itemToSummary(item, section));

  const years = [
    ...new Set(all.map((item) => item.year).filter((year): year is number => typeof year === "number" && year > 0)),
  ].sort((a, b) => b - a);

  return {
    items: pageItems,
    total: sorted.length,
    page,
    pageSize,
    hasMore: page * pageSize < sorted.length,
    facets: { years, genres: [], categories: [section.label] },
    section: { id: section.id, label: section.label, kind: sectionKind, count: all.length },
    offline,
  };
}

function pickPoster(items: ListingItem[], folderPath: string): string | null {
  const images = items.filter((item) => !item.isDir && isImageFile(item.name));
  if (!images.length) return `${folderPath}/a_AL_.jpg`;
  const preferred =
    images.find((item) => /^a_AL_\./i.test(item.name)) ??
    images.find((item) => /^poster\./i.test(item.name)) ??
    images.find((item) => /^folder\./i.test(item.name));
  return (preferred ?? images[0]).path;
}

function fileExtension(name: string) {
  return (name.split(".").pop() ?? "").toLowerCase();
}

function subtitleTracks(items: ListingItem[], video: ListingItem | null): SubtitleTrack[] {
  const videoBase = video ? basename(video.name).replace(/\.[^.]+$/, "").toLowerCase() : null;
  return items
    .filter((item) => !item.isDir && isSubtitleFile(item.name))
    .map((item) => {
      const name = basename(item.name);
      const base = name.replace(/\.[^.]+$/, "");
      const suffix =
        videoBase && base.toLowerCase().startsWith(videoBase) && base.length > videoBase.length
          ? base.slice(videoBase.length).replace(/^[._\-\s]+/, "")
          : "";
      return {
        label: suffix || base || name,
        path: item.path,
        format: fileExtension(name).toUpperCase() || "SRT",
      };
    });
}

function episodeNameFromFile(fileName: string): string | null {
  const cleaned = fileName.replace(/\.[^.]+$/, "");
  const match =
    cleaned.match(/\bS\d{1,2}[\s._-]*E\d{1,3}[\s._-]+(.+)$/i) ??
    cleaned.match(/\b\d{1,2}x\d{2,3}[\s._-]+(.+)$/i);
  if (!match) return null;
  const name = match[1]
    .replace(
      /\b(?:480p|540p|720p|1080p|2160p|4k|uhd|web[- ]?dl|webrip|web|bluray|blu-ray|brrip|hdrip|hdtv|dvdrip|x264|x265|h\.?264|h\.?265|hevc|avc|aac|ac3|ddp?|dts|truehd|atmos|dual|multi|audio|esubs?|msubs?|subs?|proper|repack)\b.*$/i,
      "",
    )
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s-]+|[\s-]+$/g, "")
    .trim();
  return name || null;
}

function compareVideos(a: ListingItem, b: ListingItem): number {
  const epA = parseEpisode(a.name);
  const epB = parseEpisode(b.name);
  if (epA && epB) {
    return epA.season - epB.season || epA.episode - epB.episode || a.name.localeCompare(b.name);
  }
  return a.name.localeCompare(b.name, undefined, { numeric: true });
}

function buildEpisode(video: ListingItem, season: number, episode: number, titleId: string, siblings: ListingItem[]): Episode {
  return {
    id: liveEpisodeId(video.path),
    titleId,
    season,
    episode,
    name: episodeNameFromFile(video.name),
    path: video.path,
    extension: fileExtension(video.name),
    size: video.size,
    runtime: null,
    stillUrl: null,
    overview: null,
    subtitles: subtitleTracks(siblings, video),
    addedAt: parseDirectoryIndexDate(video.mtime) || 0,
  };
}

function findCatalogItem(section: MediaSection, id: string): CatalogItem | null {
  const catalog = getSectionCatalog(section);
  return catalog?.items.find((item) => item.id === id) ?? null;
}

function summaryFromDetail(detail: TitleDetail): TitleSummary {
  const { id, kind, title, year, rating, voteCount, runtime, genres, overview, posterUrl, localPoster, backdropUrl, category, language, addedAt, totalSize, episodeCount, seasonCount, popularity, quality } = detail;
  return {
    id,
    kind,
    title,
    year,
    rating,
    voteCount,
    runtime,
    genres,
    overview,
    posterUrl,
    localPoster,
    backdropUrl,
    category,
    language,
    addedAt,
    totalSize,
    episodeCount,
    seasonCount,
    popularity,
    quality,
  };
}

export async function resolveLiveTitle(id: string): Promise<TitleDetail | null> {
  const folderPath = decodeLive(LIVE_TITLE_PREFIX, id);
  if (!folderPath) return null;

  const section = sectionForPath(folderPath);
  if (!section) return null;

  const known = findCatalogItem(section, id);
  const kind = known?.kind ?? section.kind ?? "movie";
  const mount = mountForSection(section);

  const cachedDetail = state.details.get(id);
  if (cachedDetail && Date.now() - cachedDetail.savedAt < DETAIL_TTL_MS) {
    // A detail resolved while the server was online must still disable playback
    // as soon as the mount goes away, without waiting for the detail TTL.
    if (mount && peekMountReachable(mount) === false) {
      return { ...cachedDetail.value, availability: "offline" };
    }
    return cachedDetail.value;
  }

  // Never block the details page on a dead server: if the mount is offline we
  // return the catalogue entry immediately and let the UI explain that
  // streaming resumes when the server is reachable again. Use the cached
  // reachability state first — `peekMountReachable` refreshes stale entries in
  // the background, so an offline catalog stays fast even after the TTL.
  let items: ListingItem[] = [];
  let availability: "online" | "offline" | "unknown" = "offline";
  let mountOnline = mount ? peekMountReachable(mount) : null;
  if (mount && mountOnline === null) {
    mountOnline = await withTimeout(isMountReachable(mount), 1_500, false);
  }
  if (mount && mountOnline) {
    items = await withTimeout(listDirectory(folderPath), LISTING_TIMEOUT_MS, []);
    if (!items.length && !known) return null;
    availability = items.length ? "online" : "unknown";
  } else if (!known) {
    return null;
  }

  const folderName = basename(folderPath);
  const parsed = parseMediaName(known?.rawName ?? folderName);
  const title = cleanLiveTitle(known?.title || parsed.title || folderName, folderName);
  const year = known?.year ?? parsed.year ?? extractYear(known?.rawName ?? folderName);
  const quality = known?.quality ?? qualityFromName(known?.rawName ?? folderName);

  const posterPath = pickPoster(items, folderPath);
  const rootVideos = items.filter((item) => !item.isDir && isVideoFile(item.name));
  const rootSubtitleItems = items.filter((item) => !item.isDir && isSubtitleFile(item.name));

  let episodes: Episode[] = [];
  let filePath = "";
  let extension = "";
  let rootSubtitles: SubtitleTrack[] = [];
  let totalSize = 0;

  if (kind === "series") {
    const seasonFolders = items.filter((item) => item.isDir && isSeasonFolder(item.name));
    if (seasonFolders.length) {
      const seasonLists = await mapPool(seasonFolders, 4, async (folder) => ({
        folder,
        items: await withTimeout(listDirectory(folder.path), LISTING_TIMEOUT_MS, []),
      }));
      for (const entry of seasonLists) {
        const seasonNumber =
          seasonNumberFromFolder(entry.folder.name) ??
          parseEpisode(entry.items.find((item) => !item.isDir && isVideoFile(item.name))?.name ?? "")?.season ??
          1;
        const videos = entry.items.filter((item) => !item.isDir && isVideoFile(item.name)).sort(compareVideos);
        let fallback = 0;
        for (const video of videos) {
          const parsedEpisode = parseEpisode(video.name);
          const episodeNumber = parsedEpisode?.episode ?? ++fallback;
          episodes.push(
            buildEpisode(video, parsedEpisode?.season ?? seasonNumber, episodeNumber, id, entry.items),
          );
        }
      }
    } else {
      const videos = [...rootVideos].sort(compareVideos);
      let fallback = 0;
      for (const video of videos) {
        const parsedEpisode = parseEpisode(video.name);
        episodes.push(
          buildEpisode(video, parsedEpisode?.season ?? 1, parsedEpisode?.episode ?? ++fallback, id, items),
        );
      }
    }
    episodes.sort((a, b) => a.season - b.season || a.episode - b.episode || a.path.localeCompare(b.path));
    filePath = episodes[0]?.path ?? "";
    extension = episodes[0]?.extension ?? "";
    totalSize = episodes.reduce((sum, episode) => sum + (episode.size || 0), 0);
    rootSubtitles = subtitleTracks(rootSubtitleItems, null);
  } else {
    const videos = [...rootVideos].sort((a, b) => b.size - a.size);
    const primary = videos[0] ?? null;
    filePath = primary?.path ?? "";
    extension = primary ? fileExtension(primary.name) : "";
    totalSize = videos.reduce((sum, video) => sum + (video.size || 0), 0);
    rootSubtitles = subtitleTracks(items, primary);
  }

  const seasons = [...new Set(episodes.map((episode) => episode.season))].sort((a, b) => a - b);

  const summary: TitleSummary = {
    id,
    kind,
    title,
    year,
    rating: null,
    voteCount: null,
    runtime: null,
    genres: [],
    overview: null,
    posterUrl: proxiedImage(posterPath),
    localPoster: posterPath,
    backdropUrl: null,
    category: section.label,
    language: section.language ?? known?.language ?? null,
    addedAt: known?.addedAt ?? (items.length ? parseDirectoryIndexDate(items[0]?.mtime ?? "") : 0) ?? 0,
    totalSize,
    episodeCount: kind === "series" ? episodes.length : 0,
    seasonCount: kind === "series" ? seasons.length : 0,
    popularity: 0,
    quality,
  };

  const detail: TitleDetail = {
    ...summary,
    altTitles: [],
    tagline: null,
    directors: [],
    cast: [],
    trailerUrl: null,
    folderPath,
    tmdbId: null,
    metadataStatus: "live",
    filePath,
    extension,
    subtitles: rootSubtitles,
    episodes,
    seasons,
    tmdbUrl: null,
    imdbId: null,
    availability,
  };

  // Only cache a complete result. An offline shell is returned immediately on
  // the next request too, so recovery is noticed as soon as the server is back.
  if (availability === "online") {
    state.details.set(id, { value: detail, savedAt: Date.now() });
    if (state.details.size > 200) {
      const oldest = [...state.details.entries()].sort((a, b) => a[1].savedAt - b[1].savedAt).slice(0, 50);
      for (const [key] of oldest) state.details.delete(key);
    }
  }
  return detail;
}

/** Cached reachability of the server that owns a live title, without waiting on the network. */
export function getLiveTitleAvailability(id: string): "online" | "offline" | "unknown" {
  const folderPath = decodeLive(LIVE_TITLE_PREFIX, id);
  if (!folderPath) return "unknown";
  const section = sectionForPath(folderPath);
  if (!section) return "unknown";
  const mount = mountForSection(section);
  if (!mount) return "unknown";
  const online = peekMountReachable(mount);
  return online === null ? "unknown" : online ? "online" : "offline";
}

export async function getLiveTitleSummary(id: string): Promise<TitleSummary | null> {
  const folderPath = decodeLive(LIVE_TITLE_PREFIX, id);
  if (!folderPath) return null;
  const section = sectionForPath(folderPath);
  if (!section) return null;
  const known = findCatalogItem(section, id);
  if (known) return itemToSummary(known, section);
  const detail = await resolveLiveTitle(id);
  return detail ? summaryFromDetail(detail) : null;
}

export interface LiveEpisodeRef {
  path: string;
  season: number;
  episode: number;
  title: string;
}

/** Resolve a live episode id without a network call (all information is in the path). */
export async function resolveLiveEpisode(episodeId: string): Promise<LiveEpisodeRef | null> {
  const filePath = decodeLive(LIVE_EPISODE_PREFIX, episodeId);
  if (!filePath) return null;
  const fileName = basename(filePath);
  const parent = dirname(filePath);
  const parentName = basename(parent);
  const parsed = parseEpisode(fileName);
  const isSeasonDir = isSeasonFolder(parentName);
  const showFolder = isSeasonDir ? dirname(parent) : parent;
  const season = parsed?.season ?? (isSeasonDir ? seasonNumberFromFolder(parentName) ?? 1 : 1);
  const episode = parsed?.episode ?? 1;
  const showName = parseMediaName(basename(showFolder)).title || basename(showFolder);
  return { path: filePath, season, episode, title: showName };
}

function normalizeForItem(item: CatalogItem): { title: string; raw: string; tokens: string[] } {
  const cached = state.norms.get(item.id);
  if (cached) return cached;
  const title = normalizeTitle(item.title);
  const raw = normalizeTitle(item.rawName);
  const value = { title, raw, tokens: title.split(" ").filter(Boolean) };
  state.norms.set(item.id, value);
  return value;
}

export interface LiveSearchOptions {
  limit?: number;
  kind?: MediaKind | "all";
  year?: number | null;
  language?: string | null;
  category?: string | null;
}

/**
 * Instant search across every loaded live catalog. This is a linear scan over
 * already-crawled metadata (no network), so it stays fast even with ~35k items.
 */
export function searchLiveTitles(query: string, options: LiveSearchOptions = {}): SearchHit[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  hydrateFromDisk();

  const normalized = normalizeTitle(trimmed);
  if (!normalized) return [];
  const tokens = normalized.split(" ").filter(Boolean);
  const yearQuery = /^(?:19|20)\d{2}$/.test(trimmed) ? Number(trimmed) : null;
  const limit = Math.max(1, Math.min(80, options.limit ?? 40));
  const sectionFilter = options.category ? liveSectionForCategory(options.category) : null;

  const hits: { item: CatalogItem; section: MediaSection; score: number }[] = [];

  for (const section of EXTRA_SECTIONS) {
    if (options.kind && options.kind !== "all" && (section.kind ?? "movie") !== options.kind) continue;
    if (sectionFilter && section.id !== sectionFilter.id) continue;
    if (options.language) {
      const language = options.language.toLowerCase();
      if ((section.language ?? "").toLowerCase() !== language) continue;
    }

    const catalog = state.catalogs.get(section.id);
    if (!catalog?.items.length) continue;

    for (const item of catalog.items) {
      if (options.year && item.year !== options.year) continue;
      if (yearQuery && item.year !== yearQuery) continue;

      const norm = normalizeForItem(item);
      let score = 0;
      if (norm.title === normalized || norm.raw === normalized) score = 1;
      else if (norm.title.startsWith(normalized)) score = 0.94;
      else if (norm.title.includes(normalized)) score = 0.86;
      else if (norm.raw.includes(normalized)) score = 0.82;
      else if (tokens.length > 1 && tokens.every((token) => norm.title.includes(token) || norm.raw.includes(token))) {
        score = 0.76;
      } else if (tokens.length === 1 && tokens[0].length >= 3) {
        const token = tokens[0];
        if (norm.tokens.some((candidate) => candidate.startsWith(token))) score = 0.7;
        else if (norm.title.startsWith(token.slice(0, Math.max(2, token.length - 1)))) score = 0.56;
      }
      if (yearQuery && item.year === yearQuery) score = Math.max(score, 0.5);
      if (score <= 0) continue;
      hits.push({ item, section, score });
    }
  }

  hits.sort((a, b) => b.score - a.score || (b.item.year ?? 0) - (a.item.year ?? 0) || b.item.addedAt - a.item.addedAt);

  return hits.slice(0, limit).map(({ item, section, score }) => ({
    ...itemToSummary(item, section),
    score,
    matchedTitle: item.title,
  }));
}

/** Similar titles from the same live section, used by the details page rails. */
export function getLiveRelated(id: string, limit = 18): TitleSummary[] {
  const folderPath = decodeLive(LIVE_TITLE_PREFIX, id);
  if (!folderPath) return [];
  const section = sectionForPath(folderPath);
  if (!section) return [];
  const catalog = getSectionCatalog(section);
  if (!catalog?.items.length) return [];

  const current = catalog.items.find((item) => item.id === id);
  const currentYear = current?.year ?? 0;
  const candidates = catalog.items.filter((item) => item.id !== id);
  candidates.sort(
    (a, b) =>
      Math.abs((a.year ?? 0) - currentYear) - Math.abs((b.year ?? 0) - currentYear) ||
      b.addedAt - a.addedAt ||
      a.title.localeCompare(b.title),
  );
  return candidates.slice(0, limit).map((item) => itemToSummary(item, section));
}

/** Home rails built from already-warm catalogs only; never waits on a crawl. */
export function getLiveHomeSections(maxSections = 6, perSection = 14): HomeSection[] {
  hydrateFromDisk();
  const available: { section: MediaSection; items: TitleSummary[] }[] = [];
  for (const section of EXTRA_SECTIONS) {
    const catalog = state.catalogs.get(section.id);
    if (!catalog?.items.length) continue;
    const items = [...catalog.items]
      .sort((a, b) => b.addedAt - a.addedAt || a.title.localeCompare(b.title))
      .slice(0, perSection)
      .map((item) => itemToSummary(item, section));
    if (items.length) available.push({ section, items });
  }
  if (!available.length) return [];

  // Keep a couple of series rails near the top so the home page reflects the
  // large live TV catalogue, then fill the rest with the biggest movie folders.
  const seriesRails = available.filter((entry) => (entry.section.kind ?? "movie") === "series").slice(0, 2);
  const movieRails = available.filter((entry) => (entry.section.kind ?? "movie") !== "series");
  const chosen = [...seriesRails, ...movieRails].slice(0, maxSections);

  return chosen.map(({ section, items }) => {
    const kind = section.kind ?? "movie";
    const mount = mountForSection(section);
    const offline = mount ? peekMountReachable(mount) === false : false;
    return {
      key: `live-${section.id}`,
      title: section.label,
      eyebrow: offline ? `${sectionMountLabel(section)} offline · cached catalogue` : `Streaming from ${sectionMountLabel(section)}`,
      href: `${kind === "series" ? "/series" : "/movies"}?category=${encodeURIComponent(section.label)}`,
      items,
      layout: "poster",
    } satisfies HomeSection;
  });
}

export interface LiveSectionStat {
  id: string;
  label: string;
  kind: MediaKind;
  language: string | null;
  count: number;
  server: string;
}

export interface LiveStats {
  sections: LiveSectionStat[];
  totals: { titles: number; movies: number; series: number };
}

export function getLiveStats(): LiveStats {
  hydrateFromDisk();
  const sections: LiveSectionStat[] = [];
  let movies = 0;
  let series = 0;
  for (const section of EXTRA_SECTIONS) {
    const catalog = state.catalogs.get(section.id);
    const count = catalog?.items.length ?? 0;
    const kind = section.kind ?? "movie";
    if (count) {
      if (kind === "series") series += count;
      else movies += count;
    }
    sections.push({
      id: section.id,
      label: section.label,
      kind,
      language: section.language ?? null,
      count,
      server: sectionMountLabel(section),
    });
  }
  return { sections, totals: { titles: movies + series, movies, series } };
}

export function getLiveFacets(kind: MediaKind | "all" = "all"): BrowseResponse["facets"] {
  hydrateFromDisk();
  const years = new Set<number>();
  const categories = new Set<string>();
  for (const section of EXTRA_SECTIONS) {
    if (kind !== "all" && (section.kind ?? "movie") !== kind) continue;
    const catalog = state.catalogs.get(section.id);
    if (!catalog?.items.length) continue;
    categories.add(section.label);
    for (const item of catalog.items) {
      if (item.year) years.add(item.year);
    }
  }
  return {
    years: [...years].sort((a, b) => b - a),
    genres: [],
    categories: [...categories].sort(),
  };
}
