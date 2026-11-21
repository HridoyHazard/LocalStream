import { NextResponse } from "next/server";
import { getCollections, getFacets, getLanguages, getPeople, getStats } from "@/lib/server/queries";
import { ensureScanScheduled, getScanStatus, getStoredServerInfo } from "@/lib/server/scanner";
import { getLibraryVersion, getSetting } from "@/lib/server/db";
import { metadataEnabled, metadataStatus } from "@/lib/server/metadata";
import { searchIndexStats } from "@/lib/server/search";
import { serverConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  ensureScanScheduled();
  const capabilities = getSetting("streaming_capabilities");
  let streaming: unknown = null;
  if (capabilities) {
    try {
      streaming = JSON.parse(capabilities);
    } catch {
      streaming = null;
    }
  }

  return NextResponse.json(
    {
      stats: getStats(),
      scan: getScanStatus(),
      metadata: { ...metadataStatus(), enabled: metadataEnabled() },
      library: {
        version: getLibraryVersion(),
        searchIndex: searchIndexStats(),
      },
      server: {
        url: serverConfig.mediaServerUrl,
        protocol: getSetting("server_protocol") ?? "unknown",
        info: getStoredServerInfo(),
        streaming,
      },
      facets: {
        all: getFacets("all"),
        movies: getFacets("movie"),
        series: getFacets("series"),
      },
      collections: getCollections(30),
      languages: getLanguages(30),
      ...getPeople(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
