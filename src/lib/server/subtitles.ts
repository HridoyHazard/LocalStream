import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { mediaUrlForPath, serverConfig } from "./config";
import type {
  EmbeddedSubtitleProbe,
  EmbeddedSubtitleTrack,
  SubtitleExtractionState,
  SubtitleExtractionStatus,
} from "@/lib/media/types";

const execFileAsync = promisify(execFile);

/**
 * Embedded subtitle support.
 *
 * Browsers only understand WebVTT sidecar files, so subtitle streams muxed
 * inside MKV/MP4 containers are extracted with ffmpeg on demand. Extractions
 * are cached under data/subtitles and deduplicated by a small job queue.
 */

const TEXT_CODECS = new Set([
  "ass",
  "eia_608",
  "jacosub",
  "microdvd",
  "mov_text",
  "mpl2",
  "pjs",
  "realtext",
  "sami",
  "scc",
  "srt",
  "ssa",
  "stl",
  "subrip",
  "subviewer",
  "subviewer1",
  "text",
  "ttml",
  "vplayer",
  "webvtt",
]);

const BITMAP_CODECS = new Set([
  "dvb_subtitle",
  "dvb_teletext",
  "dvd_subtitle",
  "hdmv_pgs_subtitle",
  "xsub",
]);

const LANGUAGE_NAMES: Record<string, string> = {
  ara: "Arabic",
  ben: "Bengali",
  chi: "Chinese",
  zho: "Chinese",
  dan: "Danish",
  dut: "Dutch",
  nld: "Dutch",
  eng: "English",
  fil: "Filipino",
  fre: "French",
  fra: "French",
  ger: "German",
  deu: "German",
  gre: "Greek",
  ell: "Greek",
  guj: "Gujarati",
  heb: "Hebrew",
  hin: "Hindi",
  ind: "Indonesian",
  ita: "Italian",
  jpn: "Japanese",
  kan: "Kannada",
  kor: "Korean",
  mal: "Malayalam",
  mar: "Marathi",
  may: "Malay",
  msa: "Malay",
  nor: "Norwegian",
  pan: "Punjabi",
  pol: "Polish",
  por: "Portuguese",
  rus: "Russian",
  spa: "Spanish",
  swe: "Swedish",
  tam: "Tamil",
  tel: "Telugu",
  tha: "Thai",
  tur: "Turkish",
  ukr: "Ukrainian",
  urd: "Urdu",
  vie: "Vietnamese",
};

const FORMAT_LABELS: Record<string, string> = {
  ass: "ASS",
  dvb_subtitle: "DVB",
  dvb_teletext: "Teletext",
  dvd_subtitle: "VobSub",
  eia_608: "CC",
  hdmv_pgs_subtitle: "PGS",
  jacosub: "JACOsub",
  microdvd: "MicroDVD",
  mov_text: "MP4",
  mpl2: "MPL2",
  pjs: "PJS",
  realtext: "RealText",
  sami: "SAMI",
  scc: "SCC",
  srt: "SRT",
  ssa: "SSA",
  stl: "STL",
  subrip: "SRT",
  subviewer: "SubViewer",
  subviewer1: "SubViewer",
  text: "Text",
  ttml: "TTML",
  vplayer: "VPlayer",
  webvtt: "VTT",
  xsub: "XSUB",
};

interface ToolPaths {
  ffmpeg: string | null;
  ffprobe: string | null;
}

interface ProbeCacheEntry {
  expiresAt: number;
  value: EmbeddedSubtitleProbe;
}

interface ExtractionJob {
  key: string;
  output: string;
  tempPath: string;
  relativePath: string;
  track: EmbeddedSubtitleTrack;
  size: number | null;
  duration: number | null;
  state: SubtitleExtractionState;
  progress: number | null;
  error: string | null;
  child: ChildProcessWithoutNullStreams | null;
  timer: NodeJS.Timeout | null;
  startedAt: number | null;
  finishedAt: number | null;
}

const PROBE_TTL_MS = 10 * 60_000;
const MAX_PROBE_CACHE = 250;
const MAX_ACTIVE_EXTRACTIONS = 2;
const EXTRACTION_TIMEOUT_MS = 30 * 60_000;
const JOB_RETENTION_MS = 15 * 60_000;

const probeCache = new Map<string, ProbeCacheEntry>();
const jobs = new Map<string, ExtractionJob>();
const queue: ExtractionJob[] = [];
let activeExtractions = 0;
let toolsPromise: Promise<ToolPaths> | null = null;
let cachePrepared = false;

function bundledFfmpegPath() {
  const binary = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return path.join(process.cwd(), "node_modules", "ffmpeg-static", binary);
}

function bundledFfprobePaths() {
  const binary = process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
  const platforms: Record<string, string[]> = {
    win32: ["win32-x64", "win32-ia32", "win32-arm64"],
    darwin: ["darwin-arm64", "darwin-x64"],
    linux: ["linux-x64", "linux-arm64", "linux-ia32", "linux-arm"],
    freebsd: ["linux-x64"],
  };
  return (platforms[process.platform] ?? []).map((platform) =>
    path.join(process.cwd(), "node_modules", "@ffprobe-installer", platform, binary),
  );
}

function looksExecutable(candidate: string) {
  if (!candidate) return false;
  if (!candidate.includes("/") && !candidate.includes("\\")) return true;
  if (existsSync(candidate)) return true;
  return process.platform === "win32" && !candidate.toLowerCase().endsWith(".exe") && existsSync(`${candidate}.exe`);
}

async function runs(candidate: string) {
  try {
    await execFileAsync(candidate, ["-version"], { timeout: 5_000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

async function firstWorking(candidates: string[]) {
  for (const candidate of candidates) {
    if (!looksExecutable(candidate)) continue;
    if (await runs(candidate)) return candidate;
  }
  return null;
}

async function detectTools(): Promise<ToolPaths> {
  const ffmpegCandidates = [serverConfig.ffmpegPath, bundledFfmpegPath(), "ffmpeg"].filter(Boolean);
  const ffprobeCandidates = [
    serverConfig.ffprobePath,
    ...bundledFfprobePaths(),
    "ffprobe",
  ].filter(Boolean);
  const [ffmpeg, ffprobe] = await Promise.all([
    firstWorking(ffmpegCandidates),
    firstWorking(ffprobeCandidates),
  ]);
  if (!ffmpeg || !ffprobe) {
    console.warn(
      "[subtitles] embedded subtitle extraction disabled:",
      !ffmpeg ? "ffmpeg not found" : "",
      !ffprobe ? "ffprobe not found" : "",
    );
  }
  return { ffmpeg, ffprobe };
}

function resolveTools() {
  if (!toolsPromise) toolsPromise = detectTools();
  return toolsPromise;
}

function ensureCacheDir() {
  mkdirSync(serverConfig.subtitleCacheDir, { recursive: true });
  if (cachePrepared) return;
  cachePrepared = true;
  // Remove temp files left behind by a previous process.
  try {
    const cutoff = Date.now() - 6 * 60 * 60_000;
    for (const name of readdirSync(serverConfig.subtitleCacheDir)) {
      if (!name.endsWith(".tmp")) continue;
      const fullPath = path.join(serverConfig.subtitleCacheDir, name);
      try {
        if (statSync(fullPath).mtimeMs < cutoff) unlinkSync(fullPath);
      } catch {
        // Ignore files that disappear while cleaning.
      }
    }
  } catch {
    // Cleanup is best-effort.
  }
}

function cachePathFor(relativePath: string, streamIndex: number) {
  const hash = createHash("sha1")
    .update(`${relativePath}\n${streamIndex}`)
    .digest("hex")
    .slice(0, 32);
  return path.join(serverConfig.subtitleCacheDir, `${hash}.vtt`);
}

function cachedFileIsUsable(filePath: string) {
  try {
    return statSync(filePath).size > 32;
  } catch {
    return false;
  }
}

/**
 * A track cache is only reused when the caller's file size matches the size
 * recorded at extraction time. That keeps replaced files from serving stale
 * subtitles while still deduplicating jobs for the same physical file.
 */
function cacheMatchesSize(filePath: string, size: number | null) {
  if (size === null) return true;
  try {
    const meta = JSON.parse(readFileSync(`${filePath}.json`, "utf8")) as { size?: number | null };
    return typeof meta.size === "number" ? meta.size === size : true;
  } catch {
    return true;
  }
}

function removeCachedTrack(filePath: string) {
  for (const suffix of ["", ".json"]) {
    try {
      unlinkSync(`${filePath}${suffix}`);
    } catch {
      // Ignore missing cache files.
    }
  }
}

function languageName(code: string | undefined | null) {
  if (!code || code === "und") return null;
  return LANGUAGE_NAMES[code.toLowerCase()] ?? code.toUpperCase();
}

function cleanTrackTitle(value: string | undefined | null) {
  const title = value?.trim();
  if (!title || title.length > 40) return null;
  if (/[/\\]|https?:|www\.|@/i.test(title)) return null;
  if (/\.[a-z]{2,4}\b/i.test(title)) return null;
  if (
    /^(movies?mod|mkvcage|yts|yify|rarbg|psa|naisu|sartre|sam|qxr|silence|tigole|afm72|ddr|kmd|subs?|subtitles?)$/i.test(
      title,
    )
  ) {
    return null;
  }
  return title;
}

function formatLabel(codec: string) {
  return FORMAT_LABELS[codec] ?? codec.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function subtitleTrackFromStream(stream: Record<string, unknown>, position: number): EmbeddedSubtitleTrack {
  const codec = String(stream.codec_name ?? "unknown");
  const tags = (stream.tags ?? {}) as Record<string, string | undefined>;
  const disposition = (stream.disposition ?? {}) as Record<string, unknown>;
  const title = cleanTrackTitle(tags.title);
  const language = languageName(tags.language);
  const forced = Boolean(disposition.forced) || /forced/i.test(tags.title ?? "");
  const hearingImpaired =
    Boolean(disposition.hearing_impaired) || /\b(?:sdh|hearing[ -]?impaired)\b/i.test(tags.title ?? "");
  const supported = TEXT_CODECS.has(codec);
  const format = formatLabel(codec);

  let base = title && !/^(?:forced|sdh)$/i.test(title) ? title : language ?? `Track ${position + 1}`;
  if (forced && !/forced/i.test(base)) base = `${base} · Forced`;
  if (hearingImpaired && !/(?:sdh|hearing)/i.test(base)) base = `${base} · SDH`;

  let reason: string | null = null;
  if (!supported) {
    reason = BITMAP_CODECS.has(codec)
      ? `${format} subtitles are images and browsers cannot render them. Open this file in VLC to view this track.`
      : `${format} subtitles cannot be converted for browser playback. Open this file in VLC to view this track.`;
  }

  const streamIndex = Number(stream.index);
  return {
    id: `embedded:${streamIndex}`,
    streamIndex: Number.isInteger(streamIndex) ? streamIndex : position,
    label: base,
    language: tags.language && tags.language !== "und" ? tags.language.toLowerCase() : null,
    codec,
    format,
    default: Boolean(disposition.default),
    forced,
    hearingImpaired,
    supported,
    reason,
  };
}

function trimProbeCache() {
  while (probeCache.size > MAX_PROBE_CACHE) {
    const oldest = probeCache.keys().next().value;
    if (oldest === undefined) break;
    probeCache.delete(oldest);
  }
}

function probeFailure(message: string): EmbeddedSubtitleProbe {
  return { available: true, error: message, tracks: [], duration: null };
}

export async function probeEmbeddedSubtitles(relativePath: string): Promise<EmbeddedSubtitleProbe> {
  const cached = probeCache.get(relativePath);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const tools = await resolveTools();
  if (!tools.ffprobe) {
    return {
      available: false,
      error:
        "Embedded subtitles need ffprobe. Install ffmpeg (which includes ffprobe) or set FFPROBE_PATH.",
      tracks: [],
      duration: null,
    };
  }

  const args = [
    "-v",
    "error",
    "-user_agent",
    "LocalStream/1.0 (+embedded subtitle probe)",
    "-print_format",
    "json",
    "-show_entries",
    "stream=index,codec_name,codec_long_name:stream_disposition=default,forced,hearing_impaired:stream_tags=language,title:format=duration",
    "-select_streams",
    "s",
    mediaUrlForPath(relativePath),
  ];

  let result: EmbeddedSubtitleProbe;
  try {
    const { stdout } = await execFileAsync(tools.ffprobe, args, {
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });
    const parsed = JSON.parse(stdout) as {
      streams?: Record<string, unknown>[];
      format?: { duration?: string };
    };
    const tracks = (parsed.streams ?? [])
      .filter((stream) => stream.codec_type === undefined || stream.codec_type === "subtitle")
      .map((stream, index) => subtitleTrackFromStream(stream, index))
      .filter((track) => Number.isInteger(track.streamIndex));

    // Several English tracks are common in dual-audio releases; number the
    // duplicates so the menu does not show three identical entries.
    const seenLabels = new Map<string, number>();
    for (const track of tracks) {
      const key = track.label.toLowerCase();
      const count = (seenLabels.get(key) ?? 0) + 1;
      seenLabels.set(key, count);
      if (count > 1) track.label = `${track.label} (${count})`;
    }

    const durationValue = Number(parsed.format?.duration);
    result = {
      available: true,
      error: null,
      tracks,
      duration: Number.isFinite(durationValue) && durationValue > 0 ? durationValue : null,
    };
  } catch (error) {
    const details = error as { killed?: boolean; message?: string; stderr?: string };
    const message = details.killed
      ? "The media server took too long to answer while checking embedded subtitles."
      : "Embedded subtitle tracks could not be inspected on this file.";
    console.warn("[subtitles] probe failed", relativePath, details.stderr?.slice(0, 600) ?? details.message);
    result = probeFailure(message);
  }

  probeCache.set(relativePath, {
    expiresAt: Date.now() + (result.error ? 30_000 : PROBE_TTL_MS),
    value: result,
  });
  trimProbeCache();
  return result;
}

function statusFor(job: ExtractionJob): SubtitleExtractionStatus {
  return { state: job.state, progress: job.progress, error: job.error };
}

function finishJob(job: ExtractionJob, failure?: string) {
  if (job.state !== "running") return;
  if (job.timer) {
    clearTimeout(job.timer);
    job.timer = null;
  }
  activeExtractions = Math.max(0, activeExtractions - 1);
  job.finishedAt = Date.now();

  if (!failure) {
    try {
      const body = readFileSync(job.tempPath, "utf8");
      if (!body.includes("-->")) {
        failure = "No subtitle text was found in this track.";
      }
    } catch {
      failure = "The extracted subtitle file could not be read.";
    }
  }

  if (!failure) {
    try {
      renameSync(job.tempPath, job.output);
      // Record the source size next to the cache so a replaced file (same
      // path, new bytes) is re-extracted instead of serving stale subtitles.
      try {
        writeFileSync(`${job.output}.json`, JSON.stringify({ size: job.size, extractedAt: Date.now() }));
      } catch {
        // Metadata is best-effort; a missing sidecar just means no size check.
      }
      job.state = "ready";
      job.progress = 100;
      job.error = null;
      console.info("[subtitles] extracted embedded track", job.relativePath, job.track.streamIndex);
    } catch {
      failure = "The extracted subtitle file could not be saved.";
    }
  }

  if (failure) {
    job.state = "error";
    job.error = failure;
    try {
      unlinkSync(job.tempPath);
    } catch {
      // Ignore temp cleanup failures.
    }
  }

  const timer = setTimeout(() => {
    if (jobs.get(job.key) === job) jobs.delete(job.key);
  }, JOB_RETENTION_MS);
  timer.unref?.();
  pumpQueue();
}

function friendlyFfmpegError(stderr: string) {
  if (/matches no streams|does not contain any stream/i.test(stderr)) {
    return "That subtitle track no longer exists in the file.";
  }
  if (/invalid data|error while decoding|could not find codec/i.test(stderr)) {
    return "This subtitle track could not be decoded. Open the file in VLC to view it.";
  }
  return "ffmpeg could not extract this subtitle track.";
}

function startJob(job: ExtractionJob, ffmpeg: string) {
  job.state = "running";
  job.startedAt = Date.now();
  job.progress = 0;

  try {
    unlinkSync(job.tempPath);
  } catch {
    // No stale temp file.
  }

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-multiple_requests",
    "1",
    "-user_agent",
    "LocalStream/1.0 (+embedded subtitle extraction)",
    "-i",
    mediaUrlForPath(job.relativePath),
    "-map",
    `0:${job.track.streamIndex}`,
    "-c:s",
    "webvtt",
    "-f",
    "webvtt",
    "-progress",
    "pipe:1",
    "-stats_period",
    "0.5",
    job.tempPath,
  ];

  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn(ffmpeg, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    child.stdin.end();
  } catch (error) {
    finishJob(job, error instanceof Error ? error.message : "ffmpeg could not be started.");
    return;
  }
  job.child = child;

  let stdoutBuffer = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      const separator = line.indexOf("=");
      if (separator < 0) continue;
      const key = line.slice(0, separator);
      const value = line.slice(separator + 1);
      if (key === "out_time_us" || key === "out_time_ms") {
        const microseconds = Number(value);
        if (Number.isFinite(microseconds) && job.duration) {
          job.progress = Math.min(99, Math.max(1, Math.round((microseconds / 1_000_000 / job.duration) * 100)));
        }
      } else if (key === "progress" && value === "end") {
        job.progress = 100;
      }
    }
  });
  child.stderr.on("data", (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-8_000);
  });
  child.on("error", (error) => {
    finishJob(job, error.message || "ffmpeg could not be started.");
  });
  child.on("close", (code) => {
    if (job.state !== "running") return;
    if (code === 0) finishJob(job);
    else {
      console.warn("[subtitles] ffmpeg failed", job.relativePath, job.track.streamIndex, stderr.slice(-1_200));
      finishJob(job, friendlyFfmpegError(stderr));
    }
  });

  job.timer = setTimeout(() => {
    if (job.state !== "running") return;
    child.kill();
    finishJob(job, "Subtitle extraction took too long and was stopped.");
  }, EXTRACTION_TIMEOUT_MS);
  job.timer.unref?.();
}

async function startQueuedJob(job: ExtractionJob) {
  const tools = await resolveTools();
  if (!tools.ffmpeg) {
    activeExtractions = Math.max(0, activeExtractions - 1);
    job.state = "error";
    job.error = "Embedded subtitles need ffmpeg. Install it or set FFMPEG_PATH.";
    const cleanup = setTimeout(() => {
      if (jobs.get(job.key) === job) jobs.delete(job.key);
    }, JOB_RETENTION_MS);
    cleanup.unref?.();
    pumpQueue();
    return;
  }
  if (job.state !== "queued") {
    activeExtractions = Math.max(0, activeExtractions - 1);
    pumpQueue();
    return;
  }
  if (cachedFileIsUsable(job.output)) {
    if (cacheMatchesSize(job.output, job.size)) {
      activeExtractions = Math.max(0, activeExtractions - 1);
      job.state = "ready";
      job.progress = 100;
      pumpQueue();
      return;
    }
    removeCachedTrack(job.output);
  }
  startJob(job, tools.ffmpeg);
}

function pumpQueue() {
  while (activeExtractions < MAX_ACTIVE_EXTRACTIONS && queue.length > 0) {
    const job = queue.shift();
    if (!job || job.state !== "queued") continue;
    // Reserve the slot before the async setup so the next iteration cannot
    // overfill the queue while tool detection is still in flight.
    activeExtractions += 1;
    void startQueuedJob(job);
  }
}

export interface EnsureSubtitleResult extends SubtitleExtractionStatus {
  output?: string;
}

export async function ensureEmbeddedSubtitle(
  relativePath: string,
  streamIndex: number,
  size: number | null,
): Promise<EnsureSubtitleResult> {
  ensureCacheDir();
  const output = cachePathFor(relativePath, streamIndex);
  if (cachedFileIsUsable(output) && cacheMatchesSize(output, size)) {
    return { state: "ready", progress: 100, error: null, output };
  }
  // The file at this path changed size since it was cached, so the old
  // subtitles belong to different bytes. Drop them and extract again.
  if (cachedFileIsUsable(output)) removeCachedTrack(output);

  // Status polls reuse the running job instead of probing the file again.
  const existing = jobs.get(output);
  if (existing) {
    if (existing.state === "ready" && !(cachedFileIsUsable(output) && cacheMatchesSize(output, size))) {
      jobs.delete(output);
    } else {
      return { ...statusFor(existing), output: existing.state === "ready" ? existing.output : undefined };
    }
  }

  const probe = await probeEmbeddedSubtitles(relativePath);
  if (!probe.available) {
    return { state: "error", progress: null, error: probe.error ?? "Embedded subtitles are unavailable." };
  }
  if (probe.error) {
    return { state: "error", progress: null, error: probe.error };
  }
  const track = probe.tracks.find((item) => item.streamIndex === streamIndex);
  if (!track) {
    return { state: "error", progress: null, error: "That embedded subtitle track does not exist in this file." };
  }
  if (!track.supported) {
    return {
      state: "error",
      progress: null,
      error: track.reason ?? "This subtitle track cannot be displayed in a browser.",
    };
  }

  const job: ExtractionJob = {
    key: output,
    output,
    tempPath: `${output}.${process.pid}.${Date.now().toString(36)}.tmp`,
    relativePath,
    track,
    size,
    duration: probe.duration,
    state: "queued",
    progress: 0,
    error: null,
    child: null,
    timer: null,
    startedAt: null,
    finishedAt: null,
  };
  jobs.set(output, job);
  queue.push(job);
  pumpQueue();
  return statusFor(job);
}

export async function getToolStatus() {
  const tools = await resolveTools();
  return { available: Boolean(tools.ffmpeg && tools.ffprobe), ffmpeg: Boolean(tools.ffmpeg), ffprobe: Boolean(tools.ffprobe) };
}

/** Test hook: exposes cache paths without leaking them over HTTP. */
export function subtitleCachePath(relativePath: string, streamIndex: number) {
  return cachePathFor(relativePath, streamIndex);
}
