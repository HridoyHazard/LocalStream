import { NextResponse } from "next/server";
import { getCollections, getFacets, getLanguages, getPeople, getStats } from "@/lib/server/queries";
import { ensureScanScheduled, getScanStatus, getStoredServerInfo } from "@/lib/server/scanner";
import { getLibraryVersion, getSetting } from "@/lib/server/db";
import { metadataEnabled, metadataStatus } from "@/lib/server/metadata";
import { searchIndexStats } from "@/lib/server/search";
import { serverConfig } from "@/lib/server/config";
import { peekMountReachable, peekMountStatus } from "@/lib/server/reachability";
import { ensureLiveCatalogs, getLiveFacets, getLiveStats } from "@/lib/server/live-catalog";
import type { BrowseResponse, MediaKind } from "@/lib/media/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function mergeFacets(base: BrowseResponse["facets"], extra: BrowseResponse["facets"]): BrowseResponse["facets"] {
  return {
    years: [...new Set([...base.years, ...extra.years])].sort((a, b) => b - a),
    genres: [...new Set([...base.genres, ...extra.genres])].sort(),
    categories: [...new Set([...base.categories, ...extra.categories])].sort(),
  };
}

function liveFacets(kind: MediaKind | "all") {
  return getLiveFacets(kind);
}

export async function GET() {
  ensureScanScheduled();
  // Fire and forget: stats must answer immediately even on a cold start.
  void ensureLiveCatalogs();

  const capabilities = getSetting("streaming_capabilities");
  let streaming: unknown = null;
  if (capabilities) {
    try {
      streaming = JSON.parse(capabilities);
    } catch {
      streaming = null;
    }
  }

  const live = getLiveStats();
  const dbStats = getStats();

  return NextResponse.json(
    {
      stats: {
        ...dbStats,
        titles: dbStats.titles + live.totals.titles,
        movies: dbStats.movies + live.totals.movies,
        series: dbStats.series + live.totals.series,
      },
      scan: getScanStatus(),
      metadata: { ...metadataStatus(), enabled: metadataEnabled() },
      library: {
        version: getLibraryVersion(),
        searchIndex: searchIndexStats(),
      },
      server: {
        url: serverConfig.mediaServerUrl,
        protocol: getSetting("server_protocol") ?? "unknown",
        reachable: peekMountReachable(serverConfig.mounts[0]),
        reachability: peekMountStatus(serverConfig.mounts[0]),
        info: getStoredServerInfo(),
        streaming,
      },
      facets: {
        all: mergeFacets(getFacets("all"), liveFacets("all")),
        movies: mergeFacets(getFacets("movie"), liveFacets("movie")),
        series: mergeFacets(getFacets("series"), liveFacets("series")),
      },
      collections: getCollections(30),
      languages: getLanguages(30),
      ...getPeople(),
      live,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
