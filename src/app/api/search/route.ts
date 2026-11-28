import { NextRequest, NextResponse } from "next/server";
import { searchTitles } from "@/lib/server/search";
import { ensureLiveCatalogs, liveSectionForCategory, searchLiveTitles } from "@/lib/server/live-catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = params.get("q") ?? params.get("query") ?? "";
  const kindParam = params.get("kind");
  const kind = kindParam === "movie" || kindParam === "series" ? kindParam : "all";
  const limit = Math.min(80, Math.max(1, Number(params.get("limit") ?? 40) || 40));
  const year = Number(params.get("year")) || null;
  const category = params.get("category");

  const response = searchTitles({
    query,
    limit,
    kind,
    genre: params.get("genre"),
    year,
    language: params.get("language"),
    category,
    actor: params.get("actor"),
    director: params.get("director"),
  });

  // Live results only apply when no database-only category is selected.
  const liveEligible = !category || Boolean(liveSectionForCategory(category));
  let results = response.results;
  let suggestions = response.suggestions;

  if (query.trim() && liveEligible) {
    void ensureLiveCatalogs();
    const liveHits = searchLiveTitles(query, {
      limit,
      kind,
      year,
      language: params.get("language"),
      category,
    });
    if (liveHits.length) {
      const seen = new Set(results.map((hit) => hit.id));
      results = [...results, ...liveHits.filter((hit) => !seen.has(hit.id))]
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      const seenSuggestions = new Set(suggestions.map((hit) => hit.id));
      suggestions = [...suggestions, ...liveHits.filter((hit) => !seenSuggestions.has(hit.id))]
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);
    }
  }

  return NextResponse.json(
    {
      ...response,
      results,
      suggestions,
      total: Math.max(response.total, results.length),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
