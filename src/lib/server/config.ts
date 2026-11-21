import path from "node:path";

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

export const serverConfig = {
  mediaServerUrl: normalizeBaseUrl(process.env.MEDIA_SERVER_URL || "http://172.16.50.7/DHAKA-FLIX-7/"),
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

export function mediaUrlForPath(relativePath: string): string {
  const base = serverConfig.mediaServerUrl;
  const encoded = relativePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return new URL(encoded, base).toString();
}
