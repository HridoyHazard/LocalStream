import { NextRequest, NextResponse } from "next/server";
import { searchTitles } from "@/lib/server/search";
import { ensureLiveCatalogs, searchLiveTitles } from "@/lib/server/live-catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = params.get("q") ?? "";
  const limit = Math.min(12, Math.max(1, Number(params.get("limit") ?? 7) || 7));
  const kindParam = params.get("kind");
  const kind = kindParam === "movie" || kindParam === "series" ? kindParam : "all";
  const response = searchTitles({ query, limit, kind });

  let suggestions = response.suggestions;
  if (query.trim()) {
    void ensureLiveCatalogs();
    const liveHits = searchLiveTitles(query, { limit, kind });
    if (liveHits.length) {
      const seen = new Set(suggestions.map((hit) => hit.id));
      suggestions = [...suggestions, ...liveHits.filter((hit) => !seen.has(hit.id))]
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    }
  }

  return NextResponse.json(
    {
      query,
      suggestions,
      didYouMean: response.didYouMean,
      tookMs: response.tookMs,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
