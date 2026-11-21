/**
 * Pure, dependency-free helpers shared by the scanner, API and browser.
 * Everything here must be safe to import from a client component.
 */

export const VIDEO_EXTENSIONS = [
  "mp4",
  "mkv",
  "avi",
  "mov",
  "wmv",
  "webm",
  "m4v",
  "ts",
  "m2ts",
  "mpg",
  "mpeg",
  "flv",
  "ogv",
] as const;

export const SUBTITLE_EXTENSIONS = ["srt", "vtt", "ass", "ssa", "sub"] as const;
export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "avif"] as const;

const videoSet = new Set<string>(VIDEO_EXTENSIONS);
const subtitleSet = new Set<string>(SUBTITLE_EXTENSIONS);
const imageSet = new Set<string>(IMAGE_EXTENSIONS);

export function extensionOf(name: string): string {
  const clean = name.split("?")[0].split("#")[0];
  const dot = clean.lastIndexOf(".");
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : "";
}

export function isVideoFile(name: string) {
  return videoSet.has(extensionOf(name));
}

export function isSubtitleFile(name: string) {
  return subtitleSet.has(extensionOf(name));
}

export function isImageFile(name: string) {
  return imageSet.has(extensionOf(name));
}

export function basename(path: string) {
  const trimmed = path.replace(/\/+$/, "");
  const index = trimmed.lastIndexOf("/");
  return index >= 0 ? trimmed.slice(index + 1) : trimmed;
}

export function dirname(path: string) {
  const trimmed = path.replace(/\/+$/, "");
  const index = trimmed.lastIndexOf("/");
  return index >= 0 ? trimmed.slice(0, index) : "";
}

export function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Fold accents/diacritics and common typographic punctuation. */
export function foldText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u201a\u201b\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[×✕]/g, "x")
    .replace(/\u00a0/g, " ");
}

export function slugify(value: string) {
  return foldText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Aggressive normalisation used for matching. Folds punctuation, ampersands,
 * leading articles and whitespace so "Spider-Man", "Spiderman" and
 * "The Amazing Spider Man" line up sensibly.
 */
export function normalizeTitle(value: string) {
  return foldText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactTitle(value: string) {
  return normalizeTitle(value).replace(/\s+/g, "");
}

export function stripLeadingArticle(value: string) {
  return value.replace(/^(the|a|an)\s+/i, "").trim();
}

const RELEASE_TAGS = new RegExp(
  [
    "\\b(?:480p|540p|576p|720p|1080p|1440p|2160p|4k|8k|uhd|hdr10\\+?|hdr|dolby\\s*vision|dv|3d)\\b",
    "\\b(?:blu-?ray|bdrip|brrip|bdremux|remux|web-?dl|webrip|web\\b|hdrip|dvdrip|dvdscr|dvd|camrip|cam|hdcam|hdts|telesync|telecine|predvd|hdtv|pdtv|sdtv|tvrip)\\b",
    "\\b(?:x264|x265|h\\.?264|h\\.?265|hevc|avc|xvid|divx|av1|10-?bit|8-?bit)\\b",
    "\\b(?:aac|aac2\\.0|ac3|eac3|ddp?\\s*[257]\\.[01]|dts(?:-hd)?|truehd|atmos|flac|opus|mp3)\\b",
    "\\b(?:ddp[257]|5\\.1|7\\.1|dual\\s*audio|multi\\s*audio|dubbed|subbed)\\b",
    "\\b(?:amzn|nf|netflix|dsnp|hmax|atvp|pcok|hulu|itunes|apple\\s*tv|stan|zee5|hotstar|sonyliv)\\b",
    "\\b(?:proper|repack|rerip)\\b",
  ].join("|"),
  "gi",
);

const TRAILING_RELEASE_WORDS =
  /\s*[\[(]?\s*\b(?:hindi|english|bangla|bengali|tamil|telugu|malayalam|kannada|marathi|punjabi|urdu|korean|japanese|spanish|french|german|italian|russian|turkish|chinese|thai|portuguese|dutch|danish|swedish|norwegian|arabic|persian|iranian|dual\s*audio|multi\s*audio|esubs?|msubs?|subs?|extended|uncut|remastered|imax|open\s*matte)\b[\])]?\s*$/gi;

const YEAR_REGEX = /\b(19[2-9]\d|20[0-3]\d)\b/g;

/** Pick the most likely release year, preferring parenthesised years and the final plausible token. */
export function extractYear(value: string): number | null {
  const folded = foldText(value);

  const parenthesised = [
    ...folded.matchAll(/\(((?:19[2-9]\d|20[0-3]\d)(?:\s*[-–]\s*(?:19[2-9]\d|20[0-3]\d))?)\)/g),
  ];
  if (parenthesised.length) {
    const inner = parenthesised[parenthesised.length - 1][1];
    const years = inner.match(/(?:19[2-9]\d|20[0-3]\d)/g);
    if (years?.length) return Number(years[years.length - 1]);
  }

  const matches = [...folded.matchAll(YEAR_REGEX)];
  if (!matches.length) return null;

  // A title that is itself a year (1917, 2012) only counts as a release year
  // when followed by release information or when text precedes it.
  const candidate = matches[matches.length - 1];
  const index = candidate.index ?? 0;
  const before = folded.slice(0, index).replace(/[\s._\-–—[\]()]+$/g, "");
  const after = folded.slice(index + candidate[0].length);
  if (matches.length === 1 && !before.trim()) {
    if (!after.trim()) return null;
    if (/^[\s._\-–—:)\]]+/.test(after)) return Number(candidate[1]);
    if (/^\s*[\[(]?\s*(?:480p|540p|576p|720p|1080p|1440p|2160p|4k|bluray|blu-ray|webrip|web-dl|web|x264|x265|hevc|hdtv|dvdrip|hdcam|cam|remux)\b/i.test(after)) {
      return Number(candidate[1]);
    }
    return null;
  }
  return Number(candidate[1]);
}

export interface ParsedMediaName {
  title: string;
  year: number | null;
  season: number | null;
  episode: number | null;
  isEpisode: boolean;
}

const EPISODE_PATTERNS: { re: RegExp; seasonGroup: number; episodeGroup: number }[] = [
  { re: /\bS(?:eason)?\s*(\d{1,2})[\s._-]*(?:E|Ep|Episode)\s*(\d{1,3})\b/i, seasonGroup: 1, episodeGroup: 2 },
  // 1x02 style. Seasons 10+ would collide with year-like movie titles such as 10x10.
  { re: /\b([1-9])x(\d{2,3})\b/i, seasonGroup: 1, episodeGroup: 2 },
  { re: /\bSeason\s*(\d{1,2})\s*[-._ ]\s*(?:Episode|Ep|E)\s*(\d{1,3})\b/i, seasonGroup: 1, episodeGroup: 2 },
  { re: /\bS(\d{1,2})\s*[-._ ]*\s*E(\d{1,3})\b/i, seasonGroup: 1, episodeGroup: 2 },
];

export function parseEpisode(value: string): { season: number; episode: number } | null {
  for (const pattern of EPISODE_PATTERNS) {
    const match = value.match(pattern.re);
    if (match) {
      return { season: Number(match[pattern.seasonGroup]), episode: Number(match[pattern.episodeGroup]) };
    }
  }
  return null;
}

export function isSeasonFolder(name: string) {
  return /^\s*(?:season|series|s)\s*[._-]?\s*\d{1,2}\s*$/i.test(name) || /^\s*specials?\s*$/i.test(name);
}

export function seasonNumberFromFolder(name: string): number | null {
  const match = name.match(/(\d{1,2})/);
  return match ? Number(match[1]) : null;
}

const COUNTRY_WORDS =
  "France|Taiwan|USA|UK|United States|United Kingdom|Korea|South Korea|Japan|China|Hong Kong|India|Italy|Spain|Germany|Russia|Turkey|Thailand|Iran|Brazil|Mexico|Argentina|Poland|Denmark|Sweden|Norway|Netherlands|Belgium|Ireland|Australia|Canada|Indonesia|Pakistan|Bangladesh";

function cleanReleaseText(value: string) {
  let text = decodeEntities(value);
  text = foldText(text);
  text = text.replace(/\[[^\]]*\]/g, " ");
  text = text.replace(/\{[^}]*\}/g, " ");
  text = text.replace(/\([^)]*(?:\d{3,4}p|bluray|webrip|web-dl|x26[45]|hevc|dual|audio|hindi|english|esubs?|msubs?|dts|aac|amzn|nf|proper)[^)]*\)/gi, " ");
  text = text.replace(new RegExp(`\\(\\s*(?:${COUNTRY_WORDS})\\s*\\)`, "gi"), " ");
  text = text.replace(/\b(?:www\.[^\s]+|[a-z0-9-]+\.(?:com|net|org|in|me|ag|mx|to|tv|cc|ws|info))\b/gi, " ");

  // Cut at the first unambiguous release marker. This preserves titles that
  // happen to contain words like "English" or "Hindi".
  const marker = new RegExp(RELEASE_TAGS.source, "i");
  const hit = marker.exec(text);
  if (hit?.index !== undefined && hit.index > 0) text = text.slice(0, hit.index);

  text = text.replace(/[._]+/g, " ");
  text = text.replace(/\s+-\s*[A-Za-z0-9]{2,16}\s*$/, " "); // trailing release group
  text = text.replace(/\s*-\s*$/, " ");
  for (let i = 0; i < 3; i++) {
    const next = text.replace(TRAILING_RELEASE_WORDS, " ").trim();
    if (next === text.trim()) break;
    text = next;
  }
  text = text.replace(/\(\s*\)/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

/** Main filename/folder-name parser. */
export function parseMediaName(rawName: string, options: { seriesFolder?: string | null; season?: number | null } = {}): ParsedMediaName {
  const original = decodeEntities(rawName).replace(/\.[a-z0-9]{1,5}$/i, "");
  const episode = parseEpisode(original);
  const year = extractYear(original);

  let title = original;

  // Remove leading episode numbers like "01 - Pilot" only when no other
  // episode marker exists. Movie titles beginning with numbers are preserved.
  if (!episode) {
    // Deliberately conservative: "28 Years Later" and "1917" are titles.
  }

  title = title.replace(/\bS\d{1,2}\s*[-._ ]*\s*E\d{1,3}\b.*$/i, " ");
  title = title.replace(/\b[1-9]x\d{2,3}\b.*$/i, " ");
  title = title.replace(/\b(?:Season|Series)\s*\d{1,2}\b.*$/i, " ");

  // Remove only the year that was identified as the release year, preserving
  // title numerals such as "2001: A Space Odyssey" and "Blade Runner 2049".
  if (year) {
    const parenthesised = new RegExp(`\\(\\s*(?:19[2-9]\\d|20[0-3]\\d)(?:\\s*[-–]\\s*${year})?\\s*\\)`, "g");
    if (parenthesised.test(title)) {
      title = title.replace(parenthesised, " ");
    } else {
      const all = [...title.matchAll(/\b(19[2-9]\d|20[0-3]\d)\b/g)];
      const chosen = all[all.length - 1];
      if (chosen && chosen.index !== undefined) {
        title = `${title.slice(0, chosen.index)} ${title.slice(chosen.index + chosen[0].length)}`;
      }
    }
  }

  // "1927 - Downhill" leaves a leading separator after the year is removed;
  // drop it before the trailing-release-group heuristics run.
  title = title.replace(/^[\s._\-–—:)]+/, " ").trim();
  title = cleanReleaseText(title);

  // Release groups frequently trail a dash after whitespace: "Movie - RARBG".
  // Hyphenated titles such as "Avengers-Endgame" are preserved.
  title = title.replace(/\s+-\s*[A-Za-z0-9]{2,16}\s*$/, " ");
  title = title.replace(/^[\s._-]+|[\s._-]+$/g, "");
  title = title.replace(/\s+/g, " ").trim();

  if (options.seriesFolder) {
    const seriesTitle = parseMediaName(options.seriesFolder, { season: null }).title;
    if (seriesTitle) title = seriesTitle;
  }

  return {
    title: title || cleanReleaseText(original) || "Untitled",
    year,
    season: episode?.season ?? options.season ?? null,
    episode: episode?.episode ?? null,
    isEpisode: Boolean(episode),
  };
}

/** Damerau-Levenshtein distance with a cutoff for speed. */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  const rows = a.length + 1;
  const cols = b.length + 1;
  let prevPrev = new Array<number>(cols).fill(0);
  let prev = new Array<number>(cols);
  let current = new Array<number>(cols);
  for (let j = 0; j < cols; j++) prev[j] = j;

  for (let i = 1; i < rows; i++) {
    current[0] = i;
    let rowMin = current[0];
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, current[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prevPrev[j - 2] + 1);
      }
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    const swap = prevPrev;
    prevPrev = prev;
    prev = current;
    current = swap;
  }
  return prev[cols - 1];
}

export function tokenize(value: string) {
  return normalizeTitle(value).split(" ").filter(Boolean);
}

/**
 * Token-aware similar title score in the 0..1 range.
 * Handles missing articles, word-order changes and small typos.
 */
export function titleSimilarity(query: string, title: string): number {
  const q = normalizeTitle(query);
  const t = normalizeTitle(title);
  if (!q || !t) return 0;
  if (q === t) return 1;
  if (compactTitle(q) === compactTitle(t)) return 0.985;
  if (t.startsWith(`${q} `)) return 0.94 + Math.min(0.04, q.length / Math.max(t.length, 1) / 25);
  if (q.startsWith(`${t} `)) return 0.92;
  if (t.includes(q) || q.includes(t)) {
    const ratio = Math.min(q.length, t.length) / Math.max(q.length, t.length);
    return 0.72 + ratio * 0.2;
  }

  const qTokens = q.split(" ").filter(Boolean);
  const tTokens = t.split(" ").filter(Boolean);
  const maxTokens = Math.max(qTokens.length, tTokens.length);
  let matched = 0;
  const used = new Set<number>();

  for (const token of qTokens) {
    let best = 0;
    let bestIndex = -1;
    for (let index = 0; index < tTokens.length; index++) {
      if (used.has(index)) continue;
      const candidate = tTokens[index];
      if (token === candidate) {
        best = 1;
        bestIndex = index;
        break;
      }
      if (token.length >= 3 && candidate.length >= 3) {
        const distance = editDistance(token, candidate, token.length >= 6 ? 2 : 1);
        if (distance <= (token.length >= 6 ? 2 : 1)) {
          const score = 1 - distance / Math.max(token.length, candidate.length);
          if (score > best) {
            best = score;
            bestIndex = index;
          }
        }
      }
      if (token.length >= 4 && candidate.startsWith(token.slice(0, Math.max(3, token.length - 1)))) {
        const score = 0.86;
        if (score > best) {
          best = score;
          bestIndex = index;
        }
      }
    }
    if (best > 0.7) {
      matched += best;
      used.add(bestIndex);
    }
  }

  const coverage = matched / maxTokens;
  const lengthPenalty = Math.max(0, 1 - Math.abs(qTokens.length - tTokens.length) / Math.max(maxTokens, 1) / 4);
  const charSimilarity = 1 - Math.min(1, editDistance(compactTitle(q), compactTitle(t), Math.max(q.length, t.length)) / Math.max(q.length, t.length, 1));
  return Math.max(coverage * lengthPenalty * 0.9, charSimilarity * 0.82);
}

export function humanBytes(bytes: number | null | undefined) {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function runtimeLabel(minutes: number | null | undefined) {
  if (!minutes || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

export function formatRating(rating: number | null | undefined) {
  if (!rating || rating <= 0) return null;
  return (Math.round(rating * 10) / 10).toFixed(1);
}
