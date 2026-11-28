import { mountPath, serverConfig, type MediaMount } from "./config";

/**
 * Curated folders on the extra servers. The primary server is walked from its
 * root; the extra servers are huge, so only these folders are scanned. Each
 * section also becomes the category shown in the Categories menu.
 */
export interface MediaSection {
  id: string;
  label: string;
  /** Id of the server in serverConfig.mounts. */
  mount: string;
  /** Folder on that server, as plain (decoded) text. */
  dir: string;
  language?: string;
  /**
   * True when the folder contains year/alphabet buckets whose children are the
   * actual title folders. The live catalogue crawls these buckets one level
   * deep instead of walking every title folder.
   */
  isContainer?: boolean;
  /** What lives inside the title folders. Defaults to "movie". */
  kind?: "movie" | "series";
}

export const EXTRA_SECTIONS: MediaSection[] = [
  { id: "movies1080p", label: "English Movies (1080p)", mount: "14", dir: "English Movies (1080p)", language: "English", isContainer: true, kind: "movie" },
  { id: "hindi", label: "Hindi Movies", mount: "14", dir: "Hindi Movies", language: "Hindi", isContainer: true, kind: "movie" },
  { id: "southMovies", label: "South Indian Movies", mount: "14", dir: "SOUTH INDIAN MOVIES/South Movies", isContainer: true, kind: "movie" },
  { id: "southDubbed", label: "South Movies Hindi Dubbed", mount: "14", dir: "SOUTH INDIAN MOVIES/Hindi Dubbed", language: "Hindi", isContainer: true, kind: "movie" },
  { id: "animation", label: "Animation Movies", mount: "14", dir: "Animation Movies", isContainer: true, kind: "movie" },
  { id: "animation1080p", label: "Animation Movies (1080p)", mount: "14", dir: "Animation Movies (1080p)", isContainer: false, kind: "movie" },
  { id: "imdb250", label: "IMDb Top-250 Movies", mount: "14", dir: "IMDb Top-250 Movies", isContainer: false, kind: "movie" },
  { id: "koreanTv", label: "Korean TV & Web Series", mount: "14", dir: "KOREAN TV & WEB Series", language: "Korean", isContainer: false, kind: "series" },
  { id: "tvSeries", label: "TV & Web Series", mount: "12", dir: "TV-WEB-Series", isContainer: true, kind: "series" },
  { id: "cartoonTv", label: "Anime & Cartoon TV Series", mount: "10", dir: "Anime & Cartoon TV Series", isContainer: true, kind: "series" },
  { id: "documentary", label: "Documentaries", mount: "10", dir: "Documentary", isContainer: false, kind: "movie" },
  { id: "wwe", label: "WWE & AEW Wrestling", mount: "10", dir: "WWE & AEW Wrestling", isContainer: true, kind: "movie" },
];

/** Sections for the given servers; sections of unknown servers are ignored. */
export function sectionsForMounts(mounts: MediaMount[]): { mount: MediaMount; section: MediaSection }[] {
  const result: { mount: MediaMount; section: MediaSection }[] = [];
  for (const mount of mounts) {
    for (const section of EXTRA_SECTIONS) {
      if (section.mount === mount.id) result.push({ mount, section });
    }
  }
  return result;
}

/** The section that contains a library path, preferring the deepest folder. */
export function sectionForPath(path: string): MediaSection | null {
  let best: MediaSection | null = null;
  let bestLength = -1;
  for (const mount of serverConfig.mounts) {
    if (!mount.id) continue;
    for (const section of EXTRA_SECTIONS) {
      if (section.mount !== mount.id) continue;
      const prefix = mountPath(mount, section.dir);
      if ((path === prefix || path.startsWith(`${prefix}/`)) && prefix.length > bestLength) {
        best = section;
        bestLength = prefix.length;
      }
    }
  }
  return best;
}
