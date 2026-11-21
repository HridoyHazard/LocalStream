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
}
