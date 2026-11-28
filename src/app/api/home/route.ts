import { NextResponse } from "next/server";
import { getHomeData } from "@/lib/server/queries";
import { ensureScanScheduled, getScanStatus } from "@/lib/server/scanner";
import { metadataStatus } from "@/lib/server/metadata";
import { ensureLiveCatalogs, getLiveHomeSections, getLiveStats } from "@/lib/server/live-catalog";
import { serverConfig } from "@/lib/server/config";
import { peekMountReachable } from "@/lib/server/reachability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  ensureScanScheduled();
  // Warm in the background; the response only uses catalogs already in memory.
  void ensureLiveCatalogs();

  const data = getHomeData();
  const liveSections = getLiveHomeSections(6, 14);
  const live = getLiveStats();

  return NextResponse.json(
    {
      ...data,
      stats: {
        ...data.stats,
        titles: data.stats.titles + live.totals.titles,
        movies: data.stats.movies + live.totals.movies,
        series: data.stats.series + live.totals.series,
      },
      sections: [...data.sections, ...liveSections],
      scan: getScanStatus(),
      metadata: metadataStatus(),
      serverReachable: peekMountReachable(serverConfig.mounts[0]),
      live,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
