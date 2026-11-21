import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Db } from "./db";
import { bumpLibraryVersion, getDb, getLastScanAt, getSetting, setSetting } from "./db";
import { serverConfig } from "./config";
import { fetchDirectoryListing, type DirectoryListing, type ListingItem, MediaServerError } from "./listing";
import {
  basename,
  decodeEntities,
  dirname,
  extensionOf,
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
import type { ScanStatus, SubtitleTrack } from "@/lib/media/types";

interface ScanJob {
  path: string;
  mtime: string;
  depth: number;
}

interface ScanOptions {
  force?: boolean;
  reason?: string;
}

const globalKey = "__localstream_scan_state__";
type GlobalScan = {
  promise: Promise<ScanStatus> | null;
  state: ScanStatus;
  interval: NodeJS.Timeout | null;
  started: boolean;
};
const globalStore = globalThis as typeof globalThis & { [globalKey]?: GlobalScan };
const store: GlobalScan =
  globalStore[globalKey] ||
  (globalStore[globalKey] = {
    promise: null,
    interval: null,
    started: false,
    state: {
      running: false,
      phase: "idle",
      scannedDirs: 0,
      discoveredFiles: 0,
      indexedTitles: 0,
      indexedEpisodes: 0,
      errors: 0,
      startedAt: null,
      finishedAt: null,
      message: null,
      lastScanAt: getLastScanAt(),
    },
  });

export function getScanStatus(): ScanStatus {
  return { ...store.state };
}

function setState(patch: Partial<ScanStatus>) {
  store.state = { ...store.state, ...patch };
}

const SCAN_LOCK_PATH = path.join(path.dirname(serverConfig.databasePath), ".scan.lock");
const SCAN_LOCK_MAX_AGE_MS = 3 * 60 * 60_000;

/**
 * The API and the standalone scanner can run in different Node processes.
 * Two concurrent writers would produce SQLITE_BUSY on whichever one is not
 * holding the write lock, so only one scan may own this file.
 */
function acquireScanLock(): boolean {
  mkdirSync(path.dirname(SCAN_LOCK_PATH), { recursive: true });
  try {
    const fd = openSync(SCAN_LOCK_PATH, "wx");
    writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
    closeSync(fd);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }

  let stale = false;
  try {
    const stats = statSync(SCAN_LOCK_PATH);
    let owner: { pid?: number; startedAt?: number } = {};
    try {
      owner = JSON.parse(readFileSync(SCAN_LOCK_PATH, "utf8")) as typeof owner;
    } catch {
      // A partially written lock is only trusted for a few seconds.
      stale = Date.now() - stats.mtimeMs > 10_000;
    }
    if (!stale) {
      const age = Date.now() - Number(owner.startedAt || stats.mtimeMs);
      stale = !Number.isFinite(age) || age > SCAN_LOCK_MAX_AGE_MS;
      if (owner.pid) {
        try {
          process.kill(owner.pid, 0);
        } catch {
          stale = true;
        }
      }
    }
  } catch {
    return false;
  }

  if (!stale) return false;
  try {
    unlinkSync(SCAN_LOCK_PATH);
  } catch {
    return false;
  }
  return acquireScanLock();
}

function releaseScanLock() {
  try {
    unlinkSync(SCAN_LOCK_PATH);
  } catch {
    // The lock was already removed; nothing else to do.
  }
}

function hashId(prefix: string, value: string) {
  return `${prefix}_${createHash("sha1").update(value).digest("hex").slice(0, 20)}`;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function prefixPattern(value: string) {
  return `${escapeLike(value)}/%`;
}

function parseMtime(value: string) {
  if (!value) return Date.now();
  const normalized = value.replace(" ", "T");
  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized) ? `${normalized}:00` : normalized;
  const ms = Date.parse(withSeconds);
  return Number.isFinite(ms) ? ms : Date.now();
}

function deriveContext(path: string) {
  const segments = path.split("/").filter(Boolean);
  const category = segments[0] || null;
  let language: string | null = null;
  if (category) {
    if (/foreign/i.test(category)) {
      language = segments[1]?.replace(/\s*(?:language|movie|movies)$/i, "").trim() || null;
    } else if (/bangla|bengali|kolkata/i.test(category)) {
      language = "Bengali";
    } else if (/english/i.test(category)) {
      language = "English";
    }
  }
  // Explicit language folders can also appear below a generic category.
  for (const segment of segments.slice(0, 3)) {
    const match = segment.match(/^(Korean|Japanese|Spanish|French|German|Italian|Russian|Turkish|Chinese|Thai|Portuguese|Dutch|Danish|Swedish|Norwegian|Iranian|Persian|Arabic|Polish|Indonesian|Brazilian)\b/i);
    if (match) {
      language = match[1];
      break;
    }
  }
  return { category, language };
}

function pickImages(files: ListingItem[]) {
  const images = files.filter((file) => isImageFile(file.name));
  if (!images.length) return { poster: null, backdrop: null };
  const scored = images
    .map((file) => {
      const name = file.name.toLowerCase();
      let score = file.size;
      if (/poster|folder|cover|front|movie|show/.test(name)) score += 10_000_000;
      if (/backdrop|fanart|background|art/.test(name)) score += 4_000_000;
      if (/thumb|screenshot|sample/.test(name)) score -= 5_000_000;
      return { file, score };
    })
    .sort((a, b) => b.score - a.score);
  const poster = scored[0]?.file.path ?? null;
  const backdrop = scored.find((entry) => /backdrop|fanart|background|art/i.test(entry.file.name))?.file.path ?? null;
  return { poster, backdrop };
}

const LANGUAGE_WORDS = [
  "English",
  "Hindi",
  "Bengali",
  "Bangla",
  "Tamil",
  "Telugu",
  "Malayalam",
  "Kannada",
  "Korean",
  "Japanese",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Russian",
  "Turkish",
  "Chinese",
  "Thai",
  "Arabic",
  "Portuguese",
  "Dutch",
  "Danish",
  "Swedish",
  "Norwegian",
  "Polish",
  "Indonesian",
];

function subtitleTracks(files: ListingItem[], videoBase?: string): SubtitleTrack[] {
  const subtitles = files.filter((file) => isSubtitleFile(file.name));
  if (!subtitles.length) return [];
  return subtitles.map((file) => {
    const stem = file.name.replace(/\.[^.]+$/, "");
    let label = LANGUAGE_WORDS.find((word) => new RegExp(`\\b${word}\\b`, "i").test(stem)) || "";
    if (!label) {
      const cleaned = stem
        .replace(/[._-]+/g, " ")
        .replace(/\b(?:s\d{1,2}e\d{1,3}|subs?|subtitles?|esub|msub|forced|sdh|hi)\b/gi, " ")
        .replace(/\b(?:720p|1080p|2160p|bluray|webrip|web-dl|x264|x265)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (cleaned && videoBase && !cleaned.toLowerCase().includes(videoBase.toLowerCase().slice(0, 12))) {
        label = cleaned.slice(0, 40);
      }
    }
    return {
      label: label || "Subtitles",
      path: file.path,
      format: extensionOf(file.name),
    };
  });
}

function episodeNumberFromName(name: string) {
  const match = name.match(/\bS\d{1,2}\s*[._-]?\s*E(\d{1,3})\b/i) || name.match(/\b\d{1,2}x(\d{1,3})\b/i);
  return match ? Number(match[1]) : null;
}

function cleanDisplayTitle(value: string) {
  return decodeEntities(value).replace(/\s+/g, " ").trim();
}

function isGenericTitle(value: string) {
  const normalized = normalizeTitle(value);
  return (
    !normalized ||
    /^(movies?|films?|tv|tv shows?|series|web series|others?|downloads?|media|video|videos|new folder|untitled)$/.test(normalized) ||
    /^\d{4}( \d{4})?$/.test(normalized) ||
    /^(season|series|specials) \d+$/.test(normalized)
  );
}

interface SeriesDescriptor {
  rootPath: string;
  title: string;
  year: number | null;
}

function describeSeries(rootPath: string, videos: ListingItem[]): SeriesDescriptor {
  const rootName = basename(rootPath);
  const parsedRoot = parseMediaName(rootName);
  let title = cleanDisplayTitle(parsedRoot.title);
  let year = parsedRoot.year;
  if (isGenericTitle(title) || isSeasonFolder(rootName)) {
    const first = videos[0];
    const parsedFile = first ? parseMediaName(first.name) : null;
    if (parsedFile?.title && !isGenericTitle(parsedFile.title)) {
      title = cleanDisplayTitle(parsedFile.title);
      year = year ?? parsedFile.year;
    }
  }
  if (!year) {
    for (const video of videos.slice(0, 6)) {
      const candidate = parseMediaName(video.name).year;
      if (candidate) {
        year = candidate;
        break;
      }
    }
  }
  return { rootPath, title: title || rootName || "Untitled series", year };
}

function meaningfulVideos(videos: ListingItem[]) {
  const excluded = videos.filter((video) => !/(^|[^a-z])(sample|trailer|teaser|featurette|extras?|bonus)([^a-z]|$)/i.test(video.name));
  const large = excluded.filter((video) => video.size === 0 || video.size >= 5 * 1024 * 1024);
  return (large.length ? large : excluded.length ? excluded : videos).sort((a, b) => b.size - a.size);
}

const PART_SUFFIX = /\b(?:part|pt|cd|disc|disk)\s*[0-9]{1,2}\b\s*$/i;

/** "Champian_Part_01" and "Champian Part 2" belong to the same film. */
function stripPartSuffix(value: string) {
  return value.replace(PART_SUFFIX, " ").replace(/[\s\-–—:,.]+$/g, "").trim();
}

function groupingKey(title: string) {
  return normalizeTitle(stripPartSuffix(title));
}

const PART_INDEX = /\b(?:part|pt|cd|disc|disk)\s*([0-9]{1,2})\b/i;

/**
 * Multi-part films play from part 1; otherwise the largest file wins (it is
 * normally the best quality version in folders with duplicates).
 */
function preferredPrimary(videos: ListingItem[]) {
  const parts = videos
    .map((video) => ({ video, match: video.name.match(PART_INDEX) }))
    .filter((entry): entry is { video: ListingItem; match: RegExpMatchArray } => Boolean(entry.match));
  if (parts.length === videos.length && parts.length > 1) {
    return [...parts].sort((a, b) => Number(a.match[1]) - Number(b.match[1]))[0].video;
  }
  return videos[0];
}

function isNamedCollection(folderName: string) {
  return /collection|filmography|complete|anthology|double\s*feature|trilogy|quadrilogy|box\s*set|mega\s*pack|bundle/i.test(folderName);
}

interface MoviePayload {
  id: string;
  title: string;
  year: number | null;
  path: string;
  primary: ListingItem;
}

export class Scanner {
  private db: Db;
  private force: boolean;
  private queue: ScanJob[] = [];
  private pending = 0;
  private scannedDirs = 0;
  private discoveredFiles = 0;
  private indexedTitles = 0;
  private indexedEpisodes = 0;
  private errors = 0;
  private seenVideoProbe = false;
  private imageCache = new Map<string, { poster: string | null; backdrop: string | null }>();

  private stmtGetDir: ReturnType<Db["prepare"]>;
  private stmtUpsertDir: ReturnType<Db["prepare"]>;
  private stmtChildren: ReturnType<Db["prepare"]>;
  private stmtMarkDir: ReturnType<Db["prepare"]>;
  private stmtMarkTitle: ReturnType<Db["prepare"]>;

  constructor(options: ScanOptions = {}) {
    this.db = getDb();
    this.force = Boolean(options.force);
    this.db.exec(`
      CREATE TEMP TABLE IF NOT EXISTS scan_seen_dirs(path TEXT PRIMARY KEY);
      CREATE TEMP TABLE IF NOT EXISTS scan_seen_titles(id TEXT PRIMARY KEY);
    `);
    this.stmtGetDir = this.db.prepare("SELECT * FROM scan_dirs WHERE path = ?");
    this.stmtUpsertDir = this.db.prepare(`
      INSERT INTO scan_dirs(path, parent_path, mtime, kind, item_count, depth, last_scan_at)
      VALUES(@path, @parent_path, @mtime, @kind, @item_count, @depth, @last_scan_at)
      ON CONFLICT(path) DO UPDATE SET
        parent_path = excluded.parent_path,
        mtime = excluded.mtime,
        kind = excluded.kind,
        item_count = excluded.item_count,
        depth = excluded.depth,
        last_scan_at = excluded.last_scan_at
    `);
    this.stmtChildren = this.db.prepare("SELECT path FROM scan_dirs WHERE parent_path = ?");
    this.stmtMarkDir = this.db.prepare("INSERT OR IGNORE INTO scan_seen_dirs(path) VALUES(?)");
    this.stmtMarkTitle = this.db.prepare("INSERT OR IGNORE INTO scan_seen_titles(id) VALUES(?)");
  }

  async run(): Promise<ScanStatus> {
    if (!acquireScanLock()) {
      setState({
        running: false,
        phase: "idle",
        message: "A scan is already running in another process. The library stays available while it finishes.",
      });
      return getScanStatus();
    }

    const startedAt = Date.now();
    try {
      setState({
        running: true,
        phase: "connecting",
        scannedDirs: 0,
        discoveredFiles: 0,
        indexedTitles: 0,
        indexedEpisodes: 0,
        errors: 0,
        startedAt,
        finishedAt: null,
        message: this.force ? "Full rescan requested" : "Connecting to the media server…",
      });

      this.db.exec("DELETE FROM scan_seen_dirs; DELETE FROM scan_seen_titles;");

      const runRow = this.db
        .prepare("INSERT INTO scan_runs(started_at, status) VALUES(?, 'running')")
        .run(startedAt);
      const runId = Number(runRow.lastInsertRowid);

      try {
        const rootListing = await this.fetchWithRetry("", true);
        setState({ phase: "scanning", message: `Connected to ${rootListing.protocol === "h5ai" ? "h5ai directory index" : "HTTP directory index"}` });
        setSetting("server_protocol", rootListing.protocol);
        setSetting("server_root_url", serverConfig.mediaServerUrl);

        await this.processListing("", "", 0, rootListing, true);

        // The root listing queues its children; breadth-first workers walk the rest.
        await this.drainQueue();

        // A full walk knows every live folder. Keep entries that were seen and
        // only prune when the walk was complete enough to trust.
        let pruned = 0;
        if (this.force) {
          if (this.errors === 0) {
            pruned = this.pruneUnseen();
          } else {
            console.warn(`[localstream] skipped stale-entry pruning because ${this.errors} folders failed`);
          }
        }

        this.db
          .prepare(
            `UPDATE scan_runs SET finished_at = ?, status = 'complete', scanned_dirs = ?, discovered_files = ?,
               indexed_titles = ?, indexed_episodes = ?, errors = ? WHERE id = ?`,
          )
          .run(Date.now(), this.scannedDirs, this.discoveredFiles, this.indexedTitles, this.indexedEpisodes, this.errors, runId);

        this.cleanupEmptySeries();
        const finishedAt = Date.now();
        this.applySeriesArtwork();
        setSetting("last_scan_at", String(finishedAt));
        setSetting("last_scan_status", "complete");
        const version = bumpLibraryVersion();
        setState({
          running: false,
          phase: "complete",
          finishedAt,
          lastScanAt: finishedAt,
          scannedDirs: this.scannedDirs,
          discoveredFiles: this.discoveredFiles,
          indexedTitles: this.indexedTitles,
          indexedEpisodes: this.indexedEpisodes,
          errors: this.errors,
          message: `Scan complete · library version ${version}${pruned ? ` · removed ${pruned.toLocaleString()} stale titles` : ""}`,
        });

        if (serverConfig.tmdbApiKey && serverConfig.tmdbAutoEnrich) {
          setState({ phase: "metadata", message: "Enriching metadata from TMDB in the background" });
          void (async () => {
            try {
              const { enrichPendingTitles } = await import("./metadata");
              await enrichPendingTitles(60);
              setState({ phase: "complete", message: "Library and metadata are up to date" });
            } catch (error) {
              console.warn("[localstream] metadata enrichment failed:", error);
              setState({ phase: "complete", message: "Library scan complete; metadata enrichment failed" });
            }
          })();
        }

        return getScanStatus();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.db
          .prepare("UPDATE scan_runs SET finished_at = ?, status = 'error', scanned_dirs = ?, discovered_files = ?, indexed_titles = ?, indexed_episodes = ?, errors = ?, message = ? WHERE id = ?")
          .run(Date.now(), this.scannedDirs, this.discoveredFiles, this.indexedTitles, this.indexedEpisodes, this.errors, message, runId);
        setSetting("last_scan_status", "error");
        setSetting("last_scan_error", message);
        setState({
          running: false,
          phase: "error",
          finishedAt: Date.now(),
          message,
          scannedDirs: this.scannedDirs,
          discoveredFiles: this.discoveredFiles,
          errors: this.errors + 1,
        });
        return getScanStatus();
      }
    } finally {
      releaseScanLock();
    }
  }

  /**
   * Deletes titles and cached directory rows that a completed full walk did
   * not encounter. Children are removed through the title foreign keys so a
   * renamed or deleted folder cannot leave orphan episodes behind.
   */
  private pruneUnseen() {
    const before = (this.db.prepare("SELECT COUNT(*) AS count FROM titles").get() as { count: number }).count;
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM titles WHERE id NOT IN (SELECT id FROM scan_seen_titles)").run();
      this.db.prepare("DELETE FROM episodes WHERE title_id NOT IN (SELECT id FROM titles)").run();
      this.db.prepare("DELETE FROM media_files WHERE title_id NOT IN (SELECT id FROM titles)").run();
      this.db.prepare("DELETE FROM scan_dirs WHERE path NOT IN (SELECT path FROM scan_seen_dirs)").run();
    })();
    const after = (this.db.prepare("SELECT COUNT(*) AS count FROM titles").get() as { count: number }).count;
    return Math.max(0, before - after);
  }

  private async drainQueue() {
    const concurrency = serverConfig.scanConcurrency;
    let inFlight = 0;
    let lastTick = Date.now();

    const worker = async () => {
      while (true) {
        const job = this.queue.shift();
        if (!job) {
          if (this.pending === 0) return;
          await new Promise((resolve) => setTimeout(resolve, 35));
          continue;
        }
        inFlight += 1;
        try {
          await this.processDirectory(job);
        } catch (error) {
          this.errors += 1;
          console.warn(`[localstream] scan error for ${job.path}:`, error instanceof Error ? error.message : error);
        } finally {
          inFlight -= 1;
          this.pending -= 1;
          this.scannedDirs += 1;
          const now = Date.now();
          if (now - lastTick > 1200) {
            lastTick = now;
            setState({
              scannedDirs: this.scannedDirs,
              discoveredFiles: this.discoveredFiles,
              indexedTitles: this.indexedTitles,
              indexedEpisodes: this.indexedEpisodes,
              errors: this.errors,
              message: `Scanning ${this.scannedDirs.toLocaleString()} folders · ${this.discoveredFiles.toLocaleString()} files found`,
            });
          }
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, worker));
  }

  private async processDirectory(job: ScanJob) {
    const cached = this.stmtGetDir.get(job.path) as
      | { path: string; mtime: string; kind: string; item_count: number }
      | undefined;

    if (!this.force && cached && cached.kind !== "collection" && cached.mtime === job.mtime) {
      const hasContent =
        cached.kind === "movie"
          ? Boolean(this.db.prepare("SELECT 1 FROM titles WHERE kind = 'movie' AND folder_path = ?").get(job.path))
          : cached.kind === "season" || cached.kind === "series"
            ? Boolean(this.db.prepare("SELECT 1 FROM media_files WHERE substr(path, 1, ?) = ? LIMIT 1").get(job.path.length + 1, `${job.path}/`))
            : true;
      if (hasContent) {
        return;
      }
    }

    const listing = await this.fetchWithRetry(job.path);
    if (cached && (cached.kind === "movie" || cached.kind === "season" || cached.kind === "series")) {
      const hasVideos = listing.items.some((item) => !item.isDir && isVideoFile(item.name));
      const hasDirs = listing.items.some((item) => item.isDir);
      if (!hasVideos && !hasDirs) {
        this.db.transaction(() => {
          const prefix = `${job.path}/`;
          this.db.prepare("DELETE FROM media_files WHERE substr(path, 1, ?) = ?").run(prefix.length, prefix);
          this.db.prepare("DELETE FROM episodes WHERE substr(path, 1, ?) = ?").run(prefix.length, prefix);
          if (cached.kind === "movie") {
            this.db.prepare("DELETE FROM titles WHERE kind = 'movie' AND folder_path = ?").run(job.path);
          }
          this.cleanupEmptySeries();
        })();
      }
    }
    await this.processListing(job.path, job.mtime, job.depth, listing, false);
  }

  private async fetchWithRetry(path: string, isRoot = false) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await fetchDirectoryListing(path);
      } catch (error) {
        lastError = error;
        if (error instanceof MediaServerError && (error.code === "unauthorized" || error.code === "not-found")) {
          throw error;
        }
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      }
    }
    throw lastError;
  }

  private async processListing(path: string, mtime: string, depth: number, listing: DirectoryListing, isRoot: boolean) {
    const items = listing.items;
    const dirs = items.filter((item) => item.isDir);
    const files = items.filter((item) => !item.isDir);
    const videos = files.filter((file) => isVideoFile(file.name));
    const images = files.filter((file) => isImageFile(file.name));
    const episodeVideos = videos.filter((video) => parseEpisode(video.name));
    this.imageCache.set(path, pickImages(images));

    this.discoveredFiles += videos.length;

    if (videos.length && !this.seenVideoProbe) {
      this.seenVideoProbe = true;
      void this.probeStreaming(videos[0]);
    }

    const isSeason = isSeasonFolder(basename(path));
    const seriesRoot = isSeason ? dirname(path) : path;
    const isSeries = episodeVideos.length > 0 || (isSeason && videos.length > 0);
    const kind = isSeries ? (isSeason ? "season" : "series") : videos.length > 0 ? "movie" : dirs.length ? "collection" : "other";

    this.db.transaction(() => {
      // Remove directories that no longer exist below this collection.
      if (this.stmtGetDir.get(path)) {
        const current = new Set(dirs.map((dir) => dir.path));
        const cached = this.stmtChildren.all(path) as { path: string }[];
        for (const child of cached) {
          if (!current.has(child.path)) {
            this.pruneUnder(child.path);
          }
        }
      }

      if (isSeries) {
        const descriptor = describeSeries(seriesRoot, episodeVideos.length ? episodeVideos : videos);
        const context = deriveContext(seriesRoot);
        const { poster, backdrop } = pickImages(images);
        const rootArtwork = this.imageCache.get(seriesRoot);
        const seriesPoster = poster ?? rootArtwork?.poster ?? null;
        const seriesBackdrop = backdrop ?? rootArtwork?.backdrop ?? null;
        const titleId = this.upsertTitle({
          kind: "series",
          id: hashId("sr", seriesRoot),
          title: descriptor.title,
          year: descriptor.year,
          folderPath: seriesRoot,
          category: context.category,
          language: context.language,
          localPoster: seriesPoster,
          localBackdrop: seriesBackdrop,
          filePath: "",
          extension: "",
          fileSize: 0,
          totalSize: 0,
          subtitles: [],
          addedAt: videos.reduce((max, video) => Math.max(max, parseMtime(video.mtime)), 0),
        });

        const seasonFromFolder = isSeason ? seasonNumberFromFolder(basename(path)) : null;
        const ordered = [...videos].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        let inferred = 0;
        const seenEpisodes = new Set<string>();
        for (const video of ordered) {
          if (/(^|[^a-z])(sample|trailer|teaser|featurette|extras?|bonus)([^a-z]|$)/i.test(video.name) && video.size < 300 * 1024 * 1024) {
            continue;
          }
          const parsed = parseMediaName(video.name);
          inferred += 1;
          const season = parsed.season ?? seasonFromFolder ?? 1;
          const episode = parsed.episode ?? episodeNumberFromName(video.name) ?? inferred;
          const key = `${season}:${episode}`;
          if (seenEpisodes.has(key)) continue;
          seenEpisodes.add(key);
          const tracks = subtitleTracks(files, video.name.replace(/\.[^.]+$/, ""));
          this.upsertEpisode({
            id: hashId("ep", video.path),
            titleId,
            season,
            episode,
            name: null,
            path: video.path,
            extension: extensionOf(video.name),
            size: video.size,
            modifiedAt: parseMtime(video.mtime),
            subtitles: tracks,
          });
        }

        // Remove episodes in this folder that were not seen in the new listing.
        const episodePrefix = `${path}/`;
        if (path) {
          const currentPaths = new Set(videos.map((video) => video.path));
          const stale = this.db
            .prepare("SELECT id, path FROM episodes WHERE title_id = ? AND substr(path, 1, ?) = ?")
            .all(titleId, episodePrefix.length, episodePrefix) as { id: string; path: string }[];
          for (const row of stale) {
            if (!currentPaths.has(row.path)) {
              this.db.prepare("DELETE FROM episodes WHERE id = ?").run(row.id);
            }
          }
        }

        const total = this.db
          .prepare("SELECT COALESCE(SUM(size), 0) as size, COALESCE(MAX(added_at), 0) as added FROM episodes WHERE title_id = ?")
          .get(titleId) as { size: number; added: number };
        this.db
          .prepare("UPDATE titles SET total_size = ?, added_at = MAX(added_at, ?), updated_at = ? WHERE id = ?")
          .run(total.size, total.added, Date.now(), titleId);

        if (videos.length && path) {
          this.removeStaleMediaFiles(path, videos.map((video) => video.path));
          for (const video of videos) {
            const parsed = parseMediaName(video.name);
            const season = parsed.season ?? seasonFromFolder ?? 1;
            const episode = parsed.episode ?? episodeNumberFromName(video.name);
            const episodeRow = episode
              ? (this.db.prepare("SELECT id FROM episodes WHERE path = ?").get(video.path) as { id: string } | undefined)
              : undefined;
            this.upsertMediaFile(video, titleId, episodeRow?.id ?? null, "series", season, episode);
          }
        }
        this.indexedTitles += 1;
      } else if (videos.length > 0) {
        this.indexMovieFolder(path, depth, files, videos, images);
      }

      this.stmtUpsertDir.run({
        path,
        parent_path: dirname(path),
        mtime,
        kind,
        item_count: items.length,
        depth,
        last_scan_at: Date.now(),
      });
      this.stmtMarkDir.run(path);
    })();

    for (const dir of dirs) {
      this.queue.push({ path: dir.path, mtime: dir.mtime, depth: depth + 1 });
      this.pending += 1;
    }
  }

  private indexMovieFolder(path: string, depth: number, files: ListingItem[], videos: ListingItem[], images: ListingItem[]) {
    const folderName = basename(path);
    const meaningful = meaningfulVideos(videos);
    if (!meaningful.length) return;

    const context = deriveContext(path);
    const { poster, backdrop } = pickImages(images);
    const folderParsed = parseMediaName(folderName);

    const groups = new Map<string, ListingItem[]>();
    for (const video of meaningful) {
      const parsed = parseMediaName(video.name);
      const key = groupingKey(parsed.title) || video.path;
      const list = groups.get(key) ?? [];
      list.push(video);
      groups.set(key, list);
    }

    // A folder is a collection when its name says so or when it genuinely
    // contains three or more unrelated films. Multi-part movies such as
    // "Champian_Part_01/02" must stay a single title.
    const isCollectionFolder =
      meaningful.length >= 2 && groups.size > 1 && (isNamedCollection(folderName) || groups.size >= 3);

    const titleIds: string[] = [];

    if (isCollectionFolder) {
      // Directories such as "Charlie Chaplin — Complete Filmography" contain
      // many films side by side. Each distinct title becomes its own entry.
      for (const group of groups.values()) {
        const primary = preferredPrimary(group);
        const parsed = parseMediaName(primary.name);
        const title =
          cleanDisplayTitle(stripPartSuffix(parsed.title)) || cleanDisplayTitle(folderParsed.title);
        const tracks = subtitleTracks(files, primary.name.replace(/\.[^.]+$/, ""));
        const totalSize = group.reduce((sum, video) => sum + video.size, 0);
        const titleId = this.upsertTitle({
          kind: "movie",
          id: hashId("mv", primary.path),
          title,
          year: parsed.year ?? folderParsed.year,
          folderPath: primary.path,
          category: context.category,
          language: context.language,
          localPoster: poster,
          localBackdrop: backdrop,
          filePath: primary.path,
          extension: extensionOf(primary.name),
          fileSize: primary.size,
          totalSize,
          subtitles: tracks,
          addedAt: parseMtime(primary.mtime),
        });
        titleIds.push(titleId);
        for (const video of group) this.upsertMediaFile(video, titleId, null, "movie", null, null);
      }
      this.indexedTitles += titleIds.length;
    } else {
      const primary = preferredPrimary(meaningful);
      const fileParsed = parseMediaName(primary.name);
      const genericFolder = isGenericTitle(folderParsed.title) || /^\(?\d{4}/.test(folderName);
      const rawTitle = cleanDisplayTitle(genericFolder ? stripPartSuffix(fileParsed.title) : folderParsed.title);
      const title = rawTitle || stripPartSuffix(fileParsed.title) || fileParsed.title;
      const year = folderParsed.year ?? fileParsed.year;
      const primaryBase = primary.name.replace(/\.[^.]+$/, "");
      const tracks = subtitleTracks(files, primaryBase);
      const totalSize = meaningful.reduce((sum, video) => sum + video.size, 0);
      const titleId = this.upsertTitle({
        kind: "movie",
        id: hashId("mv", path),
        title,
        year,
        folderPath: path,
        category: context.category,
        language: context.language,
        localPoster: poster,
        localBackdrop: backdrop,
        filePath: primary.path,
        extension: extensionOf(primary.name),
        fileSize: primary.size,
        totalSize,
        subtitles: tracks,
        addedAt: parseMtime(primary.mtime),
      });
      titleIds.push(titleId);
      this.removeStaleMediaFiles(path, videos.map((video) => video.path));
      for (const video of videos) {
        this.upsertMediaFile(video, titleId, null, "movie", null, null);
      }
      this.indexedTitles += 1;
    }

    // Drop titles that belonged to removed files in this folder.
    const prefix = `${path}/`;
    const keep = new Set(titleIds);
    const existing = this.db
      .prepare("SELECT id, folder_path FROM titles WHERE kind = 'movie' AND substr(folder_path, 1, ?) = ?")
      .all(prefix.length, prefix) as { id: string; folder_path: string }[];
    const removeTitle = this.db.prepare("DELETE FROM titles WHERE id = ?");
    for (const row of existing) {
      if (!keep.has(row.id) && row.folder_path !== path) removeTitle.run(row.id);
    }
    this.removeStaleMediaFiles(path, videos.map((video) => video.path));
  }

  private applySeriesArtwork() {
    const rows = this.db
      .prepare("SELECT id, folder_path, local_poster, local_backdrop FROM titles WHERE kind = 'series'")
      .all() as { id: string; folder_path: string; local_poster: string | null; local_backdrop: string | null }[];
    const update = this.db.prepare("UPDATE titles SET local_poster = ?, local_backdrop = ? WHERE id = ?");
    for (const row of rows) {
      if (row.local_poster && row.local_backdrop) continue;
      const art = this.imageCache.get(row.folder_path);
      if (!art) continue;
      update.run(row.local_poster ?? art.poster, row.local_backdrop ?? art.backdrop, row.id);
    }
  }

  private upsertTitle(payload: {
    kind: "movie" | "series";
    id: string;
    title: string;
    year: number | null;
    folderPath: string;
    category: string | null;
    language: string | null;
    localPoster: string | null;
    localBackdrop: string | null;
    filePath: string;
    extension: string;
    fileSize: number;
    totalSize: number;
    subtitles: SubtitleTrack[];
    addedAt: number;
  }) {
    const normalized = normalizeTitle(payload.title);
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO titles (
          id, kind, title, normalized_title, year, folder_path, category, language,
          local_poster, local_backdrop, file_path, extension, file_size, total_size,
          subtitles, added_at, updated_at, metadata_status
        ) VALUES (
          @id, @kind, @title, @normalized, @year, @folder_path, @category, @language,
          @local_poster, @local_backdrop, @file_path, @extension, @file_size, @total_size,
          @subtitles, @added_at, @updated_at, 'none'
        )
        ON CONFLICT(id) DO UPDATE SET
          title = CASE WHEN titles.metadata_status = 'matched' THEN titles.title ELSE excluded.title END,
          normalized_title = CASE WHEN titles.metadata_status = 'matched' THEN titles.normalized_title ELSE excluded.normalized_title END,
          year = CASE WHEN titles.metadata_status = 'matched' THEN titles.year ELSE excluded.year END,
          category = excluded.category,
          language = excluded.language,
          local_poster = COALESCE(excluded.local_poster, titles.local_poster),
          local_backdrop = COALESCE(excluded.local_backdrop, titles.local_backdrop),
          file_path = CASE WHEN excluded.file_path != '' THEN excluded.file_path ELSE titles.file_path END,
          extension = CASE WHEN excluded.extension != '' THEN excluded.extension ELSE titles.extension END,
          file_size = CASE WHEN excluded.file_size > 0 THEN excluded.file_size ELSE titles.file_size END,
          total_size = MAX(titles.total_size, excluded.total_size),
          subtitles = CASE WHEN excluded.kind = 'movie' THEN excluded.subtitles ELSE titles.subtitles END,
          added_at = MAX(titles.added_at, excluded.added_at),
          updated_at = excluded.updated_at`,
      )
      .run({
        id: payload.id,
        kind: payload.kind,
        title: payload.title,
        normalized,
        year: payload.year,
        folder_path: payload.folderPath,
        category: payload.category,
        language: payload.language,
        local_poster: payload.localPoster,
        local_backdrop: payload.localBackdrop,
        file_path: payload.filePath,
        extension: payload.extension,
        file_size: payload.fileSize,
        total_size: payload.totalSize,
        subtitles: JSON.stringify(payload.subtitles),
        added_at: payload.addedAt || now,
        updated_at: now,
      });
    this.stmtMarkTitle.run(payload.id);
    return payload.id;
  }

  private upsertEpisode(payload: {
    id: string;
    titleId: string;
    season: number;
    episode: number;
    name: string | null;
    path: string;
    extension: string;
    size: number;
    modifiedAt: number;
    subtitles: SubtitleTrack[];
  }) {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO episodes (
          id, title_id, season, episode, name, path, extension, size, subtitles, modified_at, added_at, updated_at
        ) VALUES (@id, @title_id, @season, @episode, @name, @path, @extension, @size, @subtitles, @modified_at, @added_at, @updated_at)
        ON CONFLICT(path) DO UPDATE SET
          title_id = excluded.title_id,
          season = excluded.season,
          episode = excluded.episode,
          name = COALESCE(episodes.name, excluded.name),
          size = excluded.size,
          extension = excluded.extension,
          subtitles = excluded.subtitles,
          modified_at = excluded.modified_at,
          added_at = MAX(episodes.added_at, excluded.added_at),
          updated_at = excluded.updated_at`,
      )
      .run({
        id: payload.id,
        title_id: payload.titleId,
        season: payload.season,
        episode: payload.episode,
        name: payload.name,
        path: payload.path,
        extension: payload.extension,
        size: payload.size,
        subtitles: JSON.stringify(payload.subtitles),
        modified_at: payload.modifiedAt,
        added_at: payload.modifiedAt || now,
        updated_at: now,
      });
    this.indexedEpisodes += 1;
  }

  private upsertMediaFile(
    video: ListingItem,
    titleId: string,
    episodeId: string | null,
    kind: "movie" | "series",
    season: number | null,
    episode: number | null,
  ) {
    this.db
      .prepare(
        `INSERT INTO media_files(path, title_id, episode_id, kind, season, episode, extension, size, modified_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET
           title_id = excluded.title_id, episode_id = excluded.episode_id, kind = excluded.kind,
           season = excluded.season, episode = excluded.episode, extension = excluded.extension,
           size = excluded.size, modified_at = excluded.modified_at`,
      )
      .run(video.path, titleId, episodeId, kind, season, episode, extensionOf(video.name), video.size, parseMtime(video.mtime));
  }

  private removeStaleMediaFiles(dirPath: string, currentPaths: string[]) {
    if (!dirPath) return;
    const prefix = `${dirPath}/`;
    const existing = this.db
      .prepare("SELECT path FROM media_files WHERE substr(path, 1, ?) = ?")
      .all(prefix.length, prefix) as { path: string }[];
    const keep = new Set(currentPaths);
    const remove = this.db.prepare("DELETE FROM media_files WHERE path = ?");
    for (const row of existing) {
      if (!keep.has(row.path)) remove.run(row.path);
    }
  }

  private pruneUnder(path: string) {
    if (!path) return;
    const prefix = prefixPattern(path);
    this.db.prepare("DELETE FROM media_files WHERE path = ? OR path LIKE ? ESCAPE '\\'").run(path, prefix);
    this.db.prepare("DELETE FROM episodes WHERE path = ? OR path LIKE ? ESCAPE '\\'").run(path, prefix);
    this.db.prepare("DELETE FROM titles WHERE folder_path = ? OR folder_path LIKE ? ESCAPE '\\'").run(path, prefix);
    this.db.prepare("DELETE FROM scan_dirs WHERE path = ? OR path LIKE ? ESCAPE '\\'").run(path, prefix);
    this.cleanupEmptySeries();
  }

  private cleanupEmptySeries() {
    this.db.prepare("DELETE FROM titles WHERE kind = 'series' AND NOT EXISTS (SELECT 1 FROM episodes WHERE episodes.title_id = titles.id)").run();
  }

  private async probeStreaming(video: ListingItem) {
    try {
      const { mediaUrlForPath } = await import("./config");
      const url = mediaUrlForPath(video.path);
      const response = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        signal: AbortSignal.timeout(10000),
      });
      const info = {
        url,
        status: response.status,
        rangeSupported: response.status === 206 || response.headers.get("accept-ranges") === "bytes",
        contentType: response.headers.get("content-type"),
        contentLength: response.headers.get("content-length"),
        contentRange: response.headers.get("content-range"),
        cors: response.headers.get("access-control-allow-origin"),
        checkedAt: Date.now(),
      };
      setSetting("streaming_capabilities", JSON.stringify(info));
      if (response.body) await response.body.cancel();
    } catch (error) {
      setSetting(
        "streaming_capabilities",
        JSON.stringify({ error: error instanceof Error ? error.message : String(error), checkedAt: Date.now() }),
      );
    }
  }
}

export function startScan(options: ScanOptions = {}): Promise<ScanStatus> {
  if (store.promise) {
    return store.promise;
  }
  const scanner = new Scanner(options);
  store.promise = scanner
    .run()
    .finally(() => {
      store.promise = null;
    });
  return store.promise;
}

export function ensureScanScheduled() {
  if (store.started) return;
  store.started = true;
  if (!serverConfig.scanOnStart) return;

  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) as count FROM titles").get() as { count: number }).count;
  const last = getLastScanAt();
  const stale = !last || Date.now() - last > serverConfig.scanIntervalMinutes * 60_000;

  if (count === 0 || stale) {
    setTimeout(() => {
      void startScan({ reason: count === 0 ? "initial" : "scheduled" });
    }, 1500);
  }

  store.interval = setInterval(() => {
    if (store.promise) return;
    const lastScan = getLastScanAt();
    if (!lastScan || Date.now() - lastScan >= serverConfig.scanIntervalMinutes * 60_000) {
      void startScan({ reason: "scheduled" });
    }
  }, Math.min(serverConfig.scanIntervalMinutes * 60_000, 15 * 60_000));
  store.interval.unref?.();
}

export function getStoredServerInfo() {
  const raw = getSetting("server_info");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}
