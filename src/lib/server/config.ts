import path from "node:path";

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

/**
 * A media server LocalStream can read from. The primary server keeps plain
 * library paths ("English Movies/Film (2020)/film.mkv"). Every extra server
 * adds a "~<id>/" prefix to its paths ("~14/Hindi Movies/..."), so one path
 * always says which server owns the file.
 */
export interface MediaMount {
  id: string;
  url: string;
  label: string;
}

export const MOUNT_PREFIX = "~";

const PRIMARY_URL = normalizeBaseUrl(process.env.MEDIA_SERVER_URL || "http://172.16.50.7/DHAKA-FLIX-7/");

const DEFAULT_EXTRA_SERVERS: MediaMount[] = [
  { id: "14", url: "http://172.16.50.14/DHAKA-FLIX-14/", label: "Server 14" },
  { id: "12", url: "http://172.16.50.12/DHAKA-FLIX-12/", label: "Server 12" },
  { id: "10", url: "http://172.16.50.10/DHAKA-FLIX-10/", label: "Server 10" },
];

/**
 * EXTRA_MEDIA_SERVERS="14=http://172.16.50.14/DHAKA-FLIX-14/,12=http://..." replaces the
 * defaults (empty string disables them). ENABLE_EXTRA_SERVERS=false also disables them.
 */
function parseExtraMounts(): MediaMount[] {
  if (process.env.ENABLE_EXTRA_SERVERS === "false") return [];
  const raw = process.env.EXTRA_MEDIA_SERVERS;
  let candidates: MediaMount[] = DEFAULT_EXTRA_SERVERS;
  if (raw !== undefined) {
    candidates = raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const eq = entry.indexOf("=");
        const id = eq > 0 ? entry.slice(0, eq).trim() : "";
        const url = eq > 0 ? entry.slice(eq + 1).trim() : "";
        return { id, url, label: `Server ${id}` };
      });
  }
  const seen = new Set<string>();
  const mounts: MediaMount[] = [];
  for (const candidate of candidates) {
    if (!/^[a-z0-9]{1,12}$/i.test(candidate.id) || seen.has(candidate.id)) continue;
    try {
      new URL(candidate.url);
    } catch {
      continue;
    }
    const url = normalizeBaseUrl(candidate.url);
    if (url === PRIMARY_URL) continue;
    seen.add(candidate.id);
    mounts.push({ id: candidate.id, url, label: candidate.label });
  }
  return mounts;
}

const MOUNTS: MediaMount[] = [{ id: "", url: PRIMARY_URL, label: "Primary server" }, ...parseExtraMounts()];

export const serverConfig = {
  mediaServerUrl: PRIMARY_URL,
  mounts: MOUNTS,
  reachabilityTimeoutMs: Math.max(300, Number(process.env.REACHABILITY_TIMEOUT_MS || 2500)),
  /**
   * Set REACHABILITY_DISABLED=true to skip the reachability probe entirely and
   * always attempt the real request. Use this if a server rejects/starves the
   * probe but still streams fine (for example behind a slow reverse proxy).
   */
  reachabilityDisabled: process.env.REACHABILITY_DISABLED === "true",
  appName: process.env.NEXT_PUBLIC_APP_NAME || "LocalStream",
  databasePath: path.resolve(process.cwd(), process.env.DATABASE_PATH || "data/localstream.db"),
  scanOnStart: process.env.SCAN_ON_START !== "false",
  scanIntervalMinutes: Math.max(5, Number(process.env.SCAN_INTERVAL_MINUTES || 45)),
  scanConcurrency: Math.min(16, Math.max(1, Number(process.env.SCAN_CONCURRENCY || 8))),
  scanRequestTimeoutMs: Math.max(5000, Number(process.env.SCAN_REQUEST_TIMEOUT_MS || 20000)),
  tmdbApiKey: process.env.TMDB_API_KEY?.trim() || "",
  tmdbLanguage: process.env.TMDB_LANGUAGE || "en-US",
  tmdbAutoEnrich: process.env.TMDB_AUTO_ENRICH !== "false",
  ffmpegPath: process.env.FFMPEG_PATH?.trim() || "",
  ffprobePath: process.env.FFPROBE_PATH?.trim() || "",
  subtitleCacheDir: path.resolve(process.cwd(), process.env.SUBTITLE_CACHE_DIR || "data/subtitles"),
  vlcCompanionUrl: process.env.VLC_COMPANION_URL || "http://127.0.0.1:8642",
  basePath: (() => {
    try {
      return new URL(normalizeBaseUrl(process.env.MEDIA_SERVER_URL || "http://172.16.50.7/DHAKA-FLIX-7/")).pathname;
    } catch {
      return "/";
    }
  })(),
} as const;

const MIME_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mkv: "video/x-matroska",
  webm: "video/webm",
  avi: "video/x-msvideo",
  mov: "video/quicktime",
  wmv: "video/x-ms-wmv",
  flv: "video/x-flv",
  ts: "video/mp2t",
  m2ts: "video/mp2t",
  mpg: "video/mpeg",
  mpeg: "video/mpeg",
  ogv: "video/ogg",
  vtt: "text/vtt; charset=utf-8",
  srt: "application/x-subrip; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
};

/** The ISP server reports application/octet-stream, so infer real MIME types. */
export function mimeTypeForPath(path: string): string | null {
  const extension = path.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  return MIME_TYPES[extension] ?? null;
}

/** Splits a library path into the server that owns it and the path on that server. */
export function splitMount(relativePath: string): { mount: MediaMount; rest: string } {
  if (relativePath.startsWith(MOUNT_PREFIX)) {
    const slash = relativePath.indexOf("/");
    const id = relativePath.slice(MOUNT_PREFIX.length, slash === -1 ? undefined : slash);
    const mount = id ? MOUNTS.find((candidate) => candidate.id === id) : undefined;
    if (mount) return { mount, rest: slash === -1 ? "" : relativePath.slice(slash + 1) };
  }
  return { mount: MOUNTS[0], rest: relativePath };
}

/** Inverse of splitMount: builds the library path for a path on a given server. */
export function mountPath(mount: MediaMount, rest: string): string {
  if (!mount.id) return rest;
  return rest ? `${MOUNT_PREFIX}${mount.id}/${rest}` : `${MOUNT_PREFIX}${mount.id}`;
}

export function mediaUrlForPath(relativePath: string): string {
  const { mount, rest } = splitMount(relativePath);
  const encoded = rest
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return new URL(encoded, mount.url).toString();
}
