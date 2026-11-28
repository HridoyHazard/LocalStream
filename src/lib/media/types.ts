export type MediaKind = "movie" | "series";

export interface SubtitleTrack {
  label: string;
  path: string;
  format: string;
}

/** A subtitle stream muxed inside the video container (MKV, MP4, ...). */
export interface EmbeddedSubtitleTrack {
  id: string;
  streamIndex: number;
  label: string;
  language: string | null;
  codec: string;
  format: string;
  default: boolean;
  forced: boolean;
  hearingImpaired: boolean;
  supported: boolean;
  reason: string | null;
}

export interface EmbeddedSubtitleProbe {
  available: boolean;
  error: string | null;
  tracks: EmbeddedSubtitleTrack[];
  duration: number | null;
}

export type SubtitleExtractionState = "queued" | "running" | "ready" | "error";

export interface SubtitleExtractionStatus {
  state: SubtitleExtractionState;
  progress: number | null;
  error: string | null;
}

export interface TitleSummary {
  id: string;
  kind: MediaKind;
  title: string;
  year: number | null;
  rating: number | null;
  voteCount: number | null;
  runtime: number | null;
  genres: string[];
  overview: string | null;
  posterUrl: string | null;
  localPoster: string | null;
  backdropUrl: string | null;
  category: string | null;
  language: string | null;
  addedAt: number;
  totalSize: number;
  episodeCount?: number;
  seasonCount?: number;
  popularity?: number;
  /** Resolution derived from the folder name for live (non-indexed) titles. */
  quality?: string | null;
}

/** A curated folder on one of the extra ISP servers, exposed in the UI. */
export interface LiveSectionSummary {
  id: string;
  label: string;
  kind: MediaKind;
  language: string | null;
  count: number;
  server: string;
}

export interface LiveStats {
  sections: LiveSectionSummary[];
  totals: { titles: number; movies: number; series: number };
}

export interface Episode {
  id: string;
  titleId: string;
  season: number;
  episode: number;
  name: string | null;
  path: string;
  extension: string;
  size: number;
  runtime: number | null;
  stillUrl: string | null;
  overview: string | null;
  subtitles: SubtitleTrack[];
  addedAt: number;
}

export interface PersonCredit {
  name: string;
  character?: string | null;
  profileUrl?: string | null;
}

export interface TitleDetail extends TitleSummary {
  altTitles: string[];
  tagline: string | null;
  directors: string[];
  cast: PersonCredit[];
  trailerUrl: string | null;
  folderPath: string;
  tmdbId: number | null;
  metadataStatus: string;
  filePath: string;
  extension: string;
  subtitles: SubtitleTrack[];
  episodes: Episode[];
  seasons: number[];
  tmdbUrl: string | null;
  imdbId: string | null;
  /**
   * Whether the owning media server answered when the title was resolved.
   * "offline" means the catalogue entry is readable but streaming is
   * unavailable until the server is back.
   */
  availability?: "online" | "offline" | "unknown";
}

export interface HomeSection {
  key: string;
  title: string;
  eyebrow: string;
  href: string;
  items: TitleSummary[];
  layout?: "poster" | "backdrop";
}

export interface HomeData {
  hero: TitleSummary[];
  sections: HomeSection[];
  stats: {
    titles: number;
    movies: number;
    series: number;
    episodes: number;
    totalSize: number;
    lastScanAt: number | null;
  };
  scan: ScanStatus;
  collections: { name: string; count: number }[];
  genres: string[];
  /** Cached primary-server reachability; null until the first probe finishes. */
  serverReachable?: boolean | null;
  /** Curated extra-server catalogs (live, not SQLite-indexed). */
  live?: LiveStats;
}

export interface ScanStatus {
  running: boolean;
  phase: "idle" | "connecting" | "scanning" | "indexing" | "metadata" | "complete" | "error";
  scannedDirs: number;
  discoveredFiles: number;
  indexedTitles: number;
  indexedEpisodes: number;
  errors: number;
  startedAt: number | null;
  finishedAt: number | null;
  message: string | null;
  lastScanAt: number | null;
}

export interface SearchHit extends TitleSummary {
  score: number;
  matchedTitle: string;
}

export interface SearchResponse {
  query: string;
  total: number;
  tookMs: number;
  results: SearchHit[];
  didYouMean: string | null;
  suggestions: SearchHit[];
}

export interface BrowseResponse {
  items: TitleSummary[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  facets: {
    years: number[];
    genres: string[];
    categories: string[];
  };
  /** Present when the page is served from a live extra-server section. */
  section?: {
    id: string;
    label: string;
    kind: MediaKind;
    count: number;
  };
  /** True when the live section's server is known to be unreachable. */
  offline?: boolean;
}

export interface MetadataStatus {
  enabled: boolean;
  total: number;
  matched: number;
  unmatched: number;
  errors: number;
}

export interface HomeResponse extends HomeData {
  scan: ScanStatus;
  metadata: MetadataStatus;
}

export interface TitleDetailResponse {
  title: TitleDetail;
  related: TitleSummary[];
  recommendations: TitleSummary[];
}

export interface SuggestResponse {
  query: string;
  suggestions: SearchHit[];
  didYouMean: string | null;
  tookMs: number;
}

export interface StatsResponse {
  stats: HomeData["stats"];
  scan: ScanStatus;
  metadata: MetadataStatus;
  library: {
    version: number;
    searchIndex: { titles: number; libraryVersion: number };
  };
  server: {
    url: string;
    protocol: string;
    /** Cached primary-server reachability; null until the first probe finishes. */
    reachable?: boolean | null;
    /** Non-blocking probe details (last error, when it was checked). */
    reachability?: { online: boolean; checkedAt: number; error: string | null } | null;
    info: Record<string, unknown> | null;
    streaming: {
      status?: number;
      rangeSupported?: boolean;
      contentType?: string | null;
      cors?: string | null;
      checkedAt?: number;
      error?: string;
    } | null;
  };
  facets: {
    all: BrowseResponse["facets"];
    movies: BrowseResponse["facets"];
    series: BrowseResponse["facets"];
  };
  collections: { name: string; count: number }[];
  languages: { name: string; count: number }[];
  people: { name: string; count: number }[];
  directors: { name: string; count: number }[];
  /** Curated extra-server catalogs (live, not SQLite-indexed). */
  live?: LiveStats;
}
